# gear-background-removal Edge Function

装备图片抠图的服务端代理。客户端只在用户主动选择“移除背景”时调用，预览阶段返回透明 PNG；用户确认后，装备保存流程只上传最终选中的原图或抠图版本。

配置并部署：

```bash
supabase secrets set REMOVE_BG_API_KEY=...
supabase functions deploy gear-background-removal
```

部署时保留 Supabase 默认 JWT 校验，不要使用 `--no-verify-jwt`。
