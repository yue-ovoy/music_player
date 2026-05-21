# Our Little Player

一个给两个人用的私人共享音乐播放器。现在这个版本是静态网页：直接打开可以本地试玩；配置 Supabase 后，可以部署成手机链接，共享上传的音乐和歌单。

## 本地打开

直接打开 `index.html` 即可。未配置 Supabase 时，歌曲保存在当前浏览器的 IndexedDB 里，只适合本机试玩。

## 云端共享

1. 新建 Supabase 项目。
2. 在 SQL Editor 运行 `supabase-schema.sql`。
3. 复制 `config.example.js` 的内容到 `config.js`。
4. 把 `supabaseUrl` 和 `supabaseAnonKey` 换成 Supabase 项目里的值。
5. 部署整个文件夹到 Vercel、Netlify 或 Cloudflare Pages。

两个人打开同一个网站链接，填写同一个「共享房间码」，就会看到同一套曲库和歌单。

## 适合继续加的功能

- 登录和邀请制，避免别人猜到房间码。
- 歌曲删除、歌单改名、歌单内排序。
- 自动读取音频时长和封面。
- 情侣纪念日主题、留言、每首歌的故事。
- 私有 Storage 签名链接，进一步保护音频文件。

## 版权提醒

建议只用于你们两个人的私人访问，不要做公开传播或公开搜索。
