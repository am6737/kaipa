# gear-image-recognition Edge Function

装备图片识别的服务端代理。客户端会将经过 `expo-image-picker` 压缩后的 JPEG
发送到该函数，再由函数调用支持视觉输入的模型，API Key 不会进入 Expo 客户端。

默认沿用项目统一的模型服务：

```bash
supabase secrets set KAIPA_AI_API_KEY=...
supabase functions deploy gear-image-recognition
```

默认请求 `https://ai.dootask.com/v1/chat/completions`，模型为
`gpt-5.6-sol`。如需覆盖：

```bash
supabase secrets set \
  GEAR_IMAGE_AI_BASE_URL=https://api.openai.com/v1 \
  GEAR_IMAGE_AI_MODEL=gpt-5.6-sol
```

模型必须支持 OpenAI Chat Completions 风格的图片输入和 JSON mode。部署时保留
Supabase 默认 JWT 校验，不要使用 `--no-verify-jwt`。
