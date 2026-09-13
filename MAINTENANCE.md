# 精灵／进化链维护说明

统一入口为 **`maintain-data.ps1`**（Windows）或 **`python maintain-data.py`**（跨平台）。脚本只在内存中读取、合并和上传图鉴及图片，不创建 `assets/`、`data/`、下载缓存或 LFS 临时文件。默认仅预览，只有加 `--publish` 才会写入远程仓库。

默认仓库：`buaa-yaoqiu/ForestallBear`，分支 `master`。所有数据变动直接发布到 GitHub，网页重新打开后会读取更新。新增条目追加在现有名单末尾，不改变已有配置使用的精灵序号；来源消失的条目不会自动删除。

## 首次准备

需要 Python 3.10+、Git，以及已登录的 GitHub 凭据。**无需安装第三方 Python 包、Playwright 或浏览器驱动。** Windows 包装脚本会查找 `py`、`python`，最后尝试当前电脑已有的 Codex Python 运行时。

在项目目录打开 PowerShell：

```powershell
cd D:\Coding\ForestallBear
./maintain-data.ps1 check
```

这会检查远程图鉴与进化链是否可读，并显示数量。若脚本执行被 PowerShell 执行策略阻止，可直接用 `py -3 maintain-data.py check`，不必修改系统执行策略。

发布时优先使用当前终端的 `GH_TOKEN` / `GITHUB_TOKEN`，否则使用 Git Credential Manager 的现有 GitHub 凭据。凭据必须能写入该仓库的 Contents，并具备 Git LFS 上传权限。不要把密码／令牌写进脚本、命令参数或发给他人；脚本不会显示令牌与签名下载链接。

## 1. 添加或更新精灵

只从 WIKI 精灵图鉴索引及对应详情页读取名称、六维种族值、属性、特性及头像。默认每次最多读取12个详情页，优先补充未从 WIKI 核对的条目；重复发布会跳过已完成条目。指定 `--name` 或加 `--refresh` 可以重新核对已存在的精灵。旧数据保留，未读取的条目不宣称已迁移来源。

```powershell
# 先看本批差异，不上传
./maintain-data.ps1 pets

# 只添加／更新一个精灵或形态（名称必须与来源一致）
./maintain-data.ps1 pets --name "椰浆布丁"
./maintain-data.ps1 pets --name "椰浆布丁" --publish

# 分批补充并发布（默认12页），重复运行继续下一批
./maintain-data.ps1 pets --publish

# 重新核对已有精灵数值，每次最多8页
./maintain-data.ps1 pets --refresh --limit 8 --delay 5 --publish

# 指定多个条目
./maintain-data.ps1 pets --name "火神" --name "烈火战神（首领形态）" --publish
```

新精灵的图片自动随数据上传到 LFS（`assets/remote/`，PNG，保留透明背景），网页按需加载，不需要再修改代码。原有精灵默认复用现有头像；需要更新图片时：

```powershell
./maintain-data.ps1 pets --name "火神" --refresh-images --publish
```

`--refresh-images` 必须指定名称，防止意外重传所有图片。新增精灵或头像来源发生变化时自动上传 PNG，其他条目保留现有头像。脚本不压缩新增 PNG；原图可能比原有 WebP 大，但只会在选中该精灵时加载。WIKI 未收录或字段缺失的精灵不会凭空创建，也不从其他站点补齐；请先完善 WIKI 资料。

## 2. 自动补充进化链

脚本从 WIKI **精灵图鉴索引中的实际链接**进入页面，只读取该页面 **进化链栏的各分支和节点**，包括首领、地区形态和同名形态；不根据图鉴相邻顺序猜测。自链接节点采用当前页完整名称，避免把地区形态误认成本来的样子。

```powershell
# 默认补尚未核实的条目，本次最多读12页，每页间隔3秒
./maintain-data.ps1 evolutions
./maintain-data.ps1 evolutions --publish

# 精确核对一个精灵（即使它以前已核实，也重新读取）
./maintain-data.ps1 evolutions --name "火神" --publish

# 小批量补缺；下次执行会跳过已核实条目
./maintain-data.ps1 evolutions --limit 8 --delay 5 --publish

# 主动重新核对已有数据
./maintain-data.ps1 evolutions --name "魔力猫" --refresh --publish
```

一页通常包含一整条链与多个分支，所以读12页可能更新几十个条目。无法匹配的形态会跳过整个分支，避免把中间阶段误判为最低阶。未读到进化链、站点结构变化、访问受限都不会清空旧映射。

出现 403、429 或“请求已被拦截”时会**停止后续请求**，不要立即反复重试，也不要通过换 IP 或账号绕过。请稍后少量运行，或在浏览器正常可访问时使用下面的手动导入。脚本不能承诺规避 WIKI 的访问限制。

默认遇到未完成项会取消本次发布。若你确认接受已经完成的部分：

```powershell
./maintain-data.ps1 evolutions --limit 8 --delay 5 --allow-partial --publish
```

这个参数只允许发布成功读取的部分，**不会**对未核实条目编造前置形态，也不自动重试被拦截的页面。

## 3. 被拦截时：用浏览器读取完整资料，再导入（不落地文件）

当脚本无法访问 WIKI、但你能正常打开页面时：

自动模式出现 HTTP 567、403、429 或“请求已被拦截”时，不要反复重试。可改用下面流程；它利用你已经正常打开的页面，不尝试绕过站点限制。

1. 用浏览器打开目标精灵页面，点击“进化链”，确认精灵资料与链条显示正常。
2. 打开开发者工具 Console，执行下面代码。代码只读取当前页面已展示的六维、属性、特性、头像地址和进化链，并将 JSON 复制到剪贴板；不读取账号信息、不额外发起网络请求、不保存文件。若浏览器阻止粘贴，请遵循浏览器提示自行处理，不要关闭安全设置。

```javascript
copy(JSON.stringify([{
  url: location.href,
  pet: (() => {
    const values = Object.fromEntries([...document.querySelectorAll('.roco-stat')].map(s => [
      s.querySelector('.roco-stat-name')?.textContent.trim(),
      Number(s.querySelector('.roco-stat-val')?.dataset.val || s.querySelector('.roco-stat-val')?.textContent)
    ]));
    return {
      name: decodeURIComponent(location.pathname.split('/').pop()).replaceAll('_', ' '),
      stats: ['生命', '攻击', '魔攻', '物防', '魔防', '速度'].map(k => values[k]),
      types: [...document.querySelectorAll('.roco-ident-types .roco-type')].map(x => x.dataset.type || x.textContent.trim()),
      trait: document.querySelector('.roco-feature-name')?.textContent.trim(),
      image: document.querySelector('.roco-art[data-view="pet"] img')?.currentSrc
    };
  })(),
  chains: [...document.querySelectorAll('.roco-evo-timeline')].map(t => ({
    nodes: [...t.querySelectorAll('.roco-evo-node')].map(n => ({
      name: n.querySelector('.roco-evo-name-main')?.textContent.trim(),
      sub: n.querySelector('.roco-evo-name-sub')?.textContent.trim() || '',
      href: n.querySelector('.roco-evo-name-main a')?.getAttribute('href') || null
    }))
  }))
}]))
```

3. 在 PowerShell 运行以下命令，然后粘贴 JSON，按 Enter，再按 Ctrl+Z、Enter 结束输入：

```powershell
./maintain-data.ps1 import-wiki
```

4. 看过预览后，用同一段 JSON 再执行发布：

```powershell
./maintain-data.ps1 import-wiki --publish
```

也可以直接从剪贴板通过包装脚本传入，不创建数据文件：

```powershell
Get-Clipboard -Raw | ./maintain-data.ps1 import-wiki
Get-Clipboard -Raw | ./maintain-data.ps1 import-wiki --publish
```

Chrome／Edge 开发者工具提供 `copy()`；这不是普通网页脚本 API。手动导入会严格校验六维、属性、特性、WIKI 页面域名和头像素材域名；任一字段缺失就停止，不用空值覆盖远程资料。没有进化链的最低阶精灵允许 `chains` 为空，精灵资料仍可导入。发布头像时脚本只将 WIKI 图片读入内存后直接上传 LFS。

## 4. 一次完成精灵与进化链更新

```powershell
./maintain-data.ps1 all --name "火神"
./maintain-data.ps1 all --name "火神" --publish
./maintain-data.ps1 all --limit 8 --delay 5 --publish
```

`all` 对同一个 WIKI 详情页同时读取精灵资料和进化链，不重复请求；`--limit` 限制本批详情页总数。未加 `--name` 时分批补缺，已从 WIKI 核对的精灵默认跳过，要重查数值请加 `--refresh`。新链节点尚未收入本批图鉴时会跳过对应分支，先继续补图鉴，再运行 `evolutions`。每次发布的图片、图鉴和进化链通过 **一次 Git 提交**一起生效；未变化的文件不额外上传。若其他人在同时提交，脚本拒绝强制覆盖，请重新预览后运行。

## 5. 发布后及本地清理

成功时输出远程提交链接，并从该提交读取图鉴／进化链验证。随后刷新网页即可使用，不需要下载仓库数据。维护脚本不修改本地 Git 分支；如果你还要提交网页代码，先同步远程历史：

```powershell
$env:GIT_LFS_SKIP_SMUDGE='1'
git fetch origin
git merge --ff-only origin/master
```

保留本仓库已有的稀疏检出（排除 `assets/` 和 `data/`）与 skip-smudge。不要运行 `git lfs pull`、不要关闭稀疏检出，否则会下载远程素材。若 `--ff-only` 提示分支分叉，先处理代码合并，不要强推。

历史残留临时文件可运行：

```powershell
./clean-lfs-temp.ps1
```

这个清理器只清理本项目 `.git/lfs/tmp` 中超过10分钟的数字命名普通文件，并在 Git LFS 正在运行时拒绝操作；不删除代码、表情包或仓库远程数据。新维护脚本完全绕开本地 LFS 对象／临时目录，正常运行不需要这一步。

## 常见问题

- **远程数据可以读，上传失败**：检查凭据、仓库写权限和 LFS 额度；失败不会先发布一半图鉴。已上传但未被提交引用的 LFS 对象可能占用远程额度，下次上传会按内容哈希复用。
- **网络或代理**：使用系统支持的 `HTTPS_PROXY` / `HTTP_PROXY` 环境设置。脚本不会修改代理，也不会把网络响应、签名URL或令牌打印到日志。
- **名字不存在**：用完整形态名称，例如 `鸭吉吉（蓬松的样子）`，保留中文括号。
- **预览有变化，第二次变化不同**：预览与发布各自重新读取实时来源，属于正常情况；脚本以发布前读取的远程提交为合并基线。
- **四张表情包**：仍留在本地且内嵌到网页；图鉴／头像不内嵌。单纯更新远程数据无需运行 build。
- **旧脚本**：`sync-data.mjs`、`thumbnails.py` 会产生本地数据，不再作为日常维护入口。请统一使用本说明的命令。`evolution-import.mjs` 是以前辅助读取的临时桥，维护时无需启动。

运行规则测试：`py -3 -B -m unittest discover -s tests -p "test_maintenance.py"`。`-B` 防止生成 Python 字节码缓存；测试使用合成数据且不会访问网络或发布。
