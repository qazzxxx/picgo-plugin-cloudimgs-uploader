# picgo-plugin-cloudimgs-uploader

为基于 [PicGo-Core](https://github.com/PicGo/PicGo-Core) 开发的项目提供的 uploader，用于上传至自建的 [云图（cloudimgs)图床](https://github.com/qazzxxx/cloudimgs)。

## 安装

- PicList

  - 在线安装

    插件设置当中搜索 cloudimgs-uploader

- npm

  npm install picgo-plugin-cloudimgs-uploader

### 离线安装

克隆本仓库，复制项目到 PicGo/PicList 插件目录，执行 `npm install`，然后重启应用即可。

## 配置

|  参数名称   |                             描述                             |            示例             | 是否必须 |
| :---------: | :----------------------------------------------------------: | :-------------------------: | :------: |
| 服务器域名  |              服务器域名，不需要填补具体上传接口              | https://img.xxx.com:8692  |    是    |
|    密码     |                   用于鉴权的 Access Password                 |           xxxxx            |    是    |
|  存储路径   |                    图片存储的文件夹名称                      |          my_folder          |    否    |

## 接口说明

插件会向 `${服务器域名}/api/upload` 发送 POST 请求。

Headers:
- `X-Access-Password`: `${密码}`

FormData:
- `image`: 图片文件
- `dir`: `${存储路径}` (可选)
