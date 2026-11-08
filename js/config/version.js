/**
 * 游戏发布版本的唯一入口。
 * 上传微信小游戏前更新 version，并在开发者工具上传窗口填写相同版本。
 * 此版本不参与存档迁移、微信基础库选择或资源图集版本管理。
 */
'use strict';
const version = '1.18.5';
module.exports = Object.freeze({ version, display: 'V' + version });
