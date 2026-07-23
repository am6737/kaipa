# smart-plan Edge Function

智能规划行程的后端代理。客户端只选择 provider id；API Key 与模型配置都放在 Supabase Secrets。

## 内置 provider

App 内所有大模型能力统一使用这个 OpenAI-compatible provider：

| id | kind | baseUrl | 默认模型 | key secret |
| --- | --- | --- | --- | --- |
| `kaipa-ai` | `openai-chat` | `https://ai.dootask.com/v1` | `gpt-5.6-sol` | `KAIPA_AI_API_KEY` |

## 推荐配置

配置服务端密钥：

```bash
supabase secrets set KAIPA_AI_API_KEY=...
supabase functions deploy smart-plan
```

`smart-plan` 在 `provider=auto` 时默认选择 `kaipa-ai`。不要把
`KAIPA_AI_API_KEY` 放进 Expo 的 `EXPO_PUBLIC_*` 环境变量；这些值会进入客户端包。

新增或覆盖 provider 时，用一个 JSON 注册表：

```bash
supabase secrets set SMART_PLAN_PROVIDERS='{
  "qwen": {
    "kind": "openai-chat",
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen-plus",
    "apiKeyEnv": "QWEN_API_KEY"
  },
  "openrouter": {
    "kind": "openai-chat",
    "baseUrl": "https://openrouter.ai/api/v1",
    "model": "deepseek/deepseek-chat",
    "apiKeyEnv": "OPENROUTER_API_KEY"
  }
}'
```

然后分别设置 `QWEN_API_KEY` / `OPENROUTER_API_KEY`。

## Provider kind

- `openai-responses`: OpenAI Responses API，endpoint 为 `/responses`。
- `openai-chat`: OpenAI-compatible Chat Completions，endpoint 为 `/chat/completions`。Kaipa 的统一模型连接走这个。
- `anthropic`: Anthropic Messages API。
- `gemini`: Gemini GenerateContent API。
