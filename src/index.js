module.exports = (ctx) => {
  const register = () => {
    ctx.helper.uploader.register('cloudimgs-uploader', {
      handle,
      config: config,
      name: '云图-cloudimgs'
    })
  }
  return {
    uploader: 'cloudimgs-uploader',
    register
  }
}

// 规范化服务器域名：去掉末尾斜杠
const normalizeOrigin = (url) => String(url || '').replace(/\/+$/, '')

// 构建上传接口完整地址：允许用户只填到域名，也可填到 /api/upload
const buildUploadUrl = (origin) => {
  const base = normalizeOrigin(origin)
  return base.endsWith('/api/upload') ? base : `${base}/api/upload`
}

// 从响应中解析最终图片地址：
//   1. 优先服务端返回的 fullUrl（绝对地址，能正确反映反代/协议）
//   2. 其次用「配置域名 + 相对 url」拼接（处理好斜杠与查询串）
//   3. 兜底：直接用 url（若本身就是绝对地址）
const resolveImageUrl = (origin, body) => {
  const data = body && body.data
  if (!data) return ''
  if (data.fullUrl && /^https?:\/\//i.test(data.fullUrl)) {
    return data.fullUrl
  }
  if (data.url) {
    if (/^https?:\/\//i.test(data.url)) return data.url
    return `${normalizeOrigin(origin)}/${String(data.url).replace(/^\/+/, '')}`
  }
  return ''
}

// 上传前显式创建目录（如不存在）。服务端 multer 的 destination 本身已 ensureDirSync 兜底，
// 这里再调用一次 /api/directories 以满足「目录不存在则通过接口创建而非上传失败」的需求。
// 任何错误（目录已存在返回 400、未开启密码、网络问题等）都忽略，交由上传接口兜底。
const ensureDirectory = async (ctx, origin, password, dir) => {
  if (!dir) return
  try {
    await ctx.request({
      method: 'POST',
      url: `${normalizeOrigin(origin)}/api/directories`,
      headers: {
        'X-Access-Password': password,
        'User-Agent': 'PicGo'
      },
      body: { name: dir },
      json: true
    })
  } catch (e) {
    ctx.log.warn(`ensureDirectory skipped: ${e && e.message ? e.message : e}`)
  }
}

const handle = async (ctx) => {
  let userConfig = ctx.getConfig('picBed.cloudimgs-uploader')
  if (!userConfig) {
    throw new Error('Can\'t find uploader config')
  }
  const origin = normalizeOrigin(userConfig.url)
  const password = userConfig.password
  let dir = userConfig.dir
  if (dir) {
    dir = String(dir).replace(/^\/+/, '').replace(/\/+$/, '').replace(/\\/g, '/')
  }

  const uploadUrl = buildUploadUrl(origin)

  // 先尝试创建目录（容忍错误）
  await ensureDirectory(ctx, origin, password, dir)

  const imgList = ctx.output
  for (let i = 0; i < imgList.length; i++) {
    let image = imgList[i].buffer
    if (!image && imgList[i].base64Image) {
      image = Buffer.from(imgList[i].base64Image, 'base64')
    }
    if (!image) {
      ctx.log.error('No image data found for', imgList[i].fileName)
      throw new Error(`没有找到图片数据：${imgList[i].fileName || ''}`)
    }

    const postConfig = postOptions(uploadUrl, password, dir, imgList[i].fileName, image)
    try {
      let body = await ctx.request(postConfig)
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (e) {
          ctx.log.error('Failed to parse response:', body)
        }
      }

      ctx.log.info('Upload response:', body)

      const imgUrl = resolveImageUrl(origin, body)
      if (imgUrl) {
        imgList[i].imgUrl = imgUrl
        imgList[i].url = imgUrl
      } else {
        ctx.log.error('Could not find URL in response', body)
        throw new Error('上传成功但响应中未找到图片地址，请查看 PicGo 日志确认服务端返回')
      }

      delete imgList[i].base64Image
      delete imgList[i].buffer
    } catch (err) {
      ctx.log.error('Upload failed', err)
      ctx.emit('notification', {
        title: '上传失败',
        body: err.message
      })
      throw err
    }
  }
  return ctx
}

const postOptions = (uploadUrl, password, dir, fileName, image) => {
  // 关键修复：必须保证 multer 的 destination 回调能读到 dir。
  // multer 是流式解析 multipart 的：若文件字段 image 排在文本字段 dir 之前，
  // 那么 destination 执行时 req.body.dir 还没被解析出来 → dir 变成空串 →
  // 文件被写进「存储根目录」，而路由随后用 req.body.dir 计算出 DB 的 rel_path
  // 仍指向子目录。于是「文件实际在根目录、DB 记录在子目录」，列表回显时
  // /api/images/<子目录>/<file> 直接 404，前端只能渲染 thumbhash 占位图。
  // 兜底两路：
  //   1) dir 放进 query string —— req.query 在 multer 回调时一定可用，最可靠；
  //   2) formData 里 dir 字段排在 image 之前 —— 兼容只读 req.body.dir 的服务端。
  const url = dir ? `${uploadUrl}?dir=${encodeURIComponent(dir)}` : uploadUrl

  const formData = {}
  if (dir) {
    formData.dir = dir
  }
  formData.image = {
    value: image,
    options: {
      filename: fileName
    }
  }

  return {
    method: 'POST',
    url: url,
    headers: {
      // 不要手动设置 Content-Type：multipart/form-data 的 boundary 由底层库
      // 在传入 formData 时自动生成，手动覆盖可能丢失 boundary 导致解析失败。
      'X-Access-Password': password,
      'User-Agent': 'PicGo'
    },
    formData: formData
  }
}

const config = ctx => {
  let userConfig = ctx.getConfig('picBed.cloudimgs-uploader')
  if (!userConfig) {
    userConfig = {}
  }
  return [
    {
      name: 'url',
      type: 'input',
      default: userConfig.url,
      required: true,
      message: '服务器域名（例如 https://img.xxx.com:8692）',
      alias: '服务器域名'
    },
    {
      name: 'password',
      type: 'input',
      default: userConfig.password,
      required: true,
      message: '图床配置的密码',
      alias: '密码'
    },
    {
      name: 'dir',
      type: 'input',
      default: userConfig.dir,
      required: false,
      message: '存储路径，不存在会自动创建（可选，如 blog/2026）',
      alias: '存储路径'
    }
  ]
}
