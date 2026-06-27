# 统一密码记录

- **日期**: 2026-06-11
- **操作人**: 发财手动安装X-UI，我（云开）改密码

## 统一密码：Daofeng888

| 项目 | 地址 | 用户名 | 密码 |
|------|------|--------|------|
| 腾讯云服务器 (zitan) | 82.156.123.28 | root | Daofeng888 |
| X-UI 面板 | https://82.156.123.28/xui/ | admin | Daofeng888 |
| SSH密钥 | Daofeng888.pem（已绑定实例） | - | 密钥文件 |

## X-UI 面板信息

- 地址: https://82.156.123.28/xui/
- 登录名: admin
- 密码: Daofeng888
- 底层 xray: 已运行，VLESS+WS+TLS 端口8443
- nginx反代: 80端口 proxypass 到 127.0.0.1:54321

## 安装过程

1. 发财在VNC中登录腾讯云服务器
2. 下载x-ui-linux-amd64-english.tar.gz
3. 解压并执行 install 脚本
4. 发财配置nginx反代将面板暴露到 /xui/ 路径
5. 我用 sudo /usr/local/bin/x-ui setting 命令修改密码为 Daofeng888
6. 确认从外网可正常登录

## SSH密钥

- daofeng_key: 已绑定 lhins-2c1tyxmw（ubuntu）
- Daofeng888.pem: 已下载到发财电脑D盘
- 我用云服务器已有私钥直接SSH访问
