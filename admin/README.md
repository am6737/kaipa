# Kaipa 管理后台

基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin)（Vite + React + TypeScript +
shadcn/ui）搭建的 Kaipa 后台管理端。当前阶段的范围与信息架构见仓库根目录
`docs/admin-console.md`（大量模块仍为 mock 骨架）。

## 开发

```bash
cd admin
npm install        # 仅使用 npm；不要引入 pnpm/yarn 锁文件
cp .env.example .env
npm run dev
```

## 构建

```bash
npm run build      # tsc -b && vite build，产物在 admin/dist（不入库）
```

Edge Function 侧的管理接口在 `supabase/functions/admin-api`；部署走仓库根目录的
`infra/supabase/deploy-functions.sh`。
