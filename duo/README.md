# 《恋爱营业中》双人云端版

独立测试入口：https://chen217323-dev.github.io/lianaiyingye/duo/
原来的主站保持不变：https://chen217323-dev.github.io/lianaiyingye/

## 当前状态
- 已提交双人账号网页，SQL 数据库初始化脚本在 supabase/schema.sql。
- 尚未建立专属 Supabase 项目、执行初始化 SQL 或创建双方账号，因此现阶段还不能同步积分。

## 配置步骤
1. 新建专属 Supabase 项目，建议名称 lianaiyingye。用户现有 Zhiyou-trip 项目与本网站无关，不应覆盖。
2. 在新项目 SQL Editor 执行仓库 supabase/schema.sql，建立积分账本、任务申请、订单、菜单及数据库权限。
3. 在 Authentication → Users → Add user 创建两个互相独立的用户，使用各自的邮箱和密码。不要发送密码给 ChatGPT。
4. 复制这两名用户的 UUID，在新项目 SQL Editor 使用下列 SQL 赋予老板和女朋友身份（先替换占位符）。

```sql
insert into public.love_profiles (id,role,display_name)
values
  ('老板的真实UUID'::uuid,'owner','老板'),
  ('女朋友的真实UUID'::uuid,'customer','女朋友');
```

5. 从项目设置的 API/API Keys 获取 Project URL 和 Publishable Key，在 duo/config.js 填写如下配置：

```js
window.LOVE_CONFIG = {
  supabaseUrl: "https://你的项目标识.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

6. 双方用各自邮箱密码在 /duo/ 登录。女朋友领取每日 +50 积分；老板批准 +20 积分，余额由数据库原子发放，女朋友应显示 70。

**安全提醒**：只可以将 Publishable/anon key 放进浏览器配置。绝对不要把 service_role、secret key、数据库密码或任何用户密码提交到 GitHub。

## 旧版数据
- 现有主页的数据在每部手机的 localStorage 中，云端版不会自动导入旧有积分和自定义菜单。
- 新项目初始化含用户所给 22 道菜与 14 项情侣任务。
- 旧版的 50 + 20 如需继承为云端 70 分，应在确认真实余额后由管理员统一设置，避免重复发分。
- 任务和订单由两个账号共享；浏览器客户端只读数据，改分和订单处理必须调用数据库受保护 RPC。
- Realtime 订阅数据变化，页面还会每10秒检查一次更新。
- 亲密互动任务均双方自愿；亲密邀请只奖励邀请。

在用户完成专属 Supabase 项目创建与账号配置前，新版不应被视为已上线可用。