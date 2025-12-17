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

const handle = async (ctx) => {
  let userConfig = ctx.getConfig('picBed.cloudimgs-uploader')
  if (!userConfig) {
    throw new Error('Can\'t find uploader config')
  }
  const url = userConfig.url
  const password = userConfig.password
  const dir = userConfig.dir

  const imgList = ctx.output
  for (let i in imgList) {
    let image = imgList[i].buffer
    if (!image && imgList[i].base64Image) {
      image = Buffer.from(imgList[i].base64Image, 'base64')
    }
    const postConfig = postOptions(url, password, dir, imgList[i].fileName, image)
    try {
        let body = await ctx.request(postConfig)
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body)
            } catch (e) {
                // If parse fails, assume it might be a raw string URL or error
                ctx.log.error('Failed to parse response:', body)
            }
        }
        
        ctx.log.info('Upload response:', body)

        // Try to find the URL in common locations
        if (body.data && body.data.url) {
            imgList[i].imgUrl = url + body.data.url
            imgList[i].url = url + body.data.url
        }else {
             ctx.log.error('Could not find URL in response', body)
             throw new Error('Upload successful but cannot find URL in response. Check PicGo logs.')
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

const postOptions = (url, password, dir, fileName, image) => {
  // Ensure url ends with /api/upload
  let requestUrl = url
  if (!requestUrl.includes('/api/upload')) {
      requestUrl = requestUrl.replace(/\/$/, '') + '/api/upload'
  }

  const formData = {
    image: {
      value: image,
      options: {
        filename: fileName
      }
    }
  }
  
  if (dir) {
    formData.dir = dir
  }
  
  return {
    method: 'POST',
    url: requestUrl,
    headers: {
      'Content-Type': 'multipart/form-data',
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
      message: '存储路径 (可选)',
      alias: '存储路径'
    }
  ]
}
