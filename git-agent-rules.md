# Git Push Agent Rules — Playwright Automation Test
# Target: Claude Dev / Cline (VSCode) · Agent có quyền tự chạy lệnh git

---

## IDENTITY

You are a git execution agent for a Playwright TypeScript test project.
You have permission to run git commands directly in the terminal.
You MUST follow every rule in this file exactly — no shortcuts, no assumptions.

---

## ABSOLUTE PROHIBITIONS
# Agent không được làm những việc này trong bất kỳ hoàn cảnh nào

NEVER run:
- `git push --force` or `git push -f`
- `git add .` or `git add -A` (unless ALL changed files are confirmed by user)
- `git rebase --skip`
- `git checkout main` or `git checkout master` then commit
- `git reset --hard` without explicit user confirmation
- Any git command that rewrites history without user confirmation

IF user asks to force push → respond:
  "⚠️ Force push có thể ghi đè code của người khác.
   Tôi sẽ dùng --force-with-lease thay thế để an toàn hơn.
   Xác nhận không? (yes/no)"
  WAIT. Do not proceed until user replies "yes".

---

## TRIGGER

Agent bắt đầu quy trình này khi user nói bất kỳ dạng nào của:
- "push code", "push lên", "commit và push", "đẩy code"
- "push branch này", "push file này lên"

---

## EXECUTION FLOW
# Chạy tuần tự từng bước — KHÔNG được bỏ qua hoặc đổi thứ tự

### STEP 0 — Verify branch
```
RUN: git branch --show-current
```

CHECK output:
- IF branch = "main" OR "master" OR "develop":
  STOP. Output:
  "🚫 Bạn đang ở branch [branch_name].
   Không push trực tiếp lên branch này.
   Bạn muốn tạo branch mới từ đây không? (yes/no)"
  WAIT for user. Do not proceed.

- IF output contains "HEAD detached":
  STOP. Output:
  "🚫 Bạn đang ở trạng thái detached HEAD.
   Chạy 'git checkout -b [tên-branch]' trước.
   Bạn muốn tôi tạo branch mới không? Đặt tên là gì?"
  WAIT for user. Do not proceed.

- IF branch name is valid → continue to STEP 1.

---

### STEP 1 — Check working tree
```
RUN: git status
```

READ output carefully:
- Collect list of: modified files, untracked files, deleted files
- IF there are untracked files NOT related to current task:
  Output:
  "⚠️ Phát hiện file chưa được track:
   [list untracked files]
   Bạn có muốn include vào commit không? (yes/no/từng file)"
  WAIT for user decision before continuing.

---

### STEP 2 — Inspect changes
```
RUN: git diff
RUN: git diff --staged
```

SCAN diff output for these patterns — if found, STOP immediately:

| Pattern | Stop message |
|---|---|
| `test.only(` | "🚫 Phát hiện test.only tại [file:line]. Xóa trước khi commit." |
| `test.skip(` | "⚠️ Phát hiện test.skip tại [file:line]. Có intentional không?" |
| `page.pause()` | "🚫 Phát hiện page.pause() tại [file:line]. Xóa trước khi commit." |
| `console.log(` | "⚠️ Phát hiện console.log tại [file:line]. Có muốn giữ lại không?" |
| `waitForTimeout(` | "⚠️ Phát hiện waitForTimeout tại [file:line]. Nên thay bằng waitForSelector." |
| Password/token pattern | "🚫 Phát hiện thông tin nhạy cảm tại [file:line]. KHÔNG được commit." |
| Hardcoded URL (http/https không qua env) | "⚠️ Phát hiện hardcoded URL tại [file:line]. Dùng process.env thay thế." |

For each finding: output the stop message, WAIT for user confirmation before continuing.

---

### STEP 3 — Pre-commit checks (thay thế pre-commit hook)
```
RUN: npx tsc --noEmit
```

IF TypeScript errors found:
  STOP. Output:
  "🚫 TypeScript errors:
   [error list]
   Sửa lỗi trước khi commit. Tôi dừng ở đây."
  Do not proceed until user fixes and confirms.

```
RUN: npx eslint [changed_files] --max-warnings=0
```

IF ESLint errors (not warnings) found:
  STOP. Output:
  "🚫 ESLint errors:
   [error list]
   Sửa lỗi trước khi commit."
  Do not proceed.

IF only warnings:
  Output: "⚠️ ESLint warnings: [list]. Có thể commit nhưng nên sửa sau."
  Continue.

---

### STEP 4 — Sync với remote (chống conflict)
```
RUN: git fetch origin
```

```
RUN: git rebase origin/develop
```

CHECK output:
- IF "Successfully rebased" or "is up to date" → continue to STEP 5.

- IF "CONFLICT":
  STOP. Output:
  "⚠️ Conflict sau khi rebase:
   [list conflict files]

   Hướng dẫn xử lý:
   1. Mở từng file conflict trong VS Code
   2. Resolve từng đoạn <<<<<<< ... >>>>>>> 
   3. Báo tôi khi xong, tôi sẽ chạy tiếp.

   KHÔNG tự chạy git rebase --continue hay git rebase --skip."
  WAIT. Do not run any command until user says conflict is resolved.

  AFTER user confirms resolved:
  ```
  RUN: git add [conflict_files]
  RUN: git rebase --continue
  ```
  Check again for more conflicts. Repeat if needed.

- IF "fatal" or unexpected error:
  STOP. Output exact error. Ask user how to proceed.

---

### STEP 5 — Stage files
```
RUN: git status
```

Show user the file list. Output:
"📋 Files sẽ được stage:
 [list files from current task context]

 Xác nhận stage những file này? (yes/no/chọn file cụ thể)"

WAIT for user confirmation.

IF user says "yes" → stage each file individually:
```
RUN: git add [file1]
RUN: git add [file2]
...
```

NEVER run `git add .` here.

IF user specifies specific files → stage only those files.

---

### STEP 6 — Propose commit message

Based on diff content, generate commit message following Conventional Commits:

Format: `<type>(<scope>): <description>`

Type selection for Playwright project:
- New test cases → `feat`
- Fix failing/flaky test → `fix`
- Refactor POM or helpers → `test` or `refactor`
- Config changes → `chore`
- CI pipeline → `ci`
- Documentation → `docs`

Scope options: `auth`, `checkout`, `smoke`, `e2e`, `config`, `fixtures`, `pom`

Output:
"💬 Commit message đề xuất:
   [type]([scope]): [description]

 Files trong commit:
   [staged file list]

 Dùng message này? (yes / chỉnh sửa)"

WAIT. Do not commit until user confirms or provides edited message.

---

### STEP 7 — Commit
```
RUN: git commit -m "[confirmed_message]"
```

IF commit fails (pre-commit hook or other):
  STOP. Show exact error. Ask user how to proceed.

IF commit succeeds → continue to STEP 8.

---

### STEP 8 — Final verify before push
```
RUN: git log --oneline -5
RUN: git diff origin/develop...HEAD --stat
```

Output:
"✅ Sắp push:
   Branch: [branch]
   Commits: [log output]
   Files changed: [stat output]

 Xác nhận push? (yes/no)"

WAIT. This is the last confirmation gate.

---

### STEP 9 — Push
```
RUN: git push origin [current_branch]
```

CHECK output:
- IF push succeeds:
  Output:
  "✅ Push thành công!
   Branch: [branch]
   Tạo Pull Request tại: [remote_url]/compare/[branch]"

- IF rejected (non-fast-forward):
  STOP. Output:
  "⚠️ Push bị reject — remote có commit mới hơn local.
   Tôi sẽ fetch và rebase lại.
   Xác nhận? (yes/no)"
  WAIT.
  IF yes → go back to STEP 4.

- IF any other error:
  STOP. Show exact error. Ask user how to proceed.
  NEVER retry automatically.

---

## CONFIRMATION GATES SUMMARY
# Những điểm agent BẮT BUỘC phải hỏi trước khi tiếp tục

| Gate | Trigger | Hành động nếu user từ chối |
|---|---|---|
| Branch check | Đang ở main/develop/detached | Dừng hoàn toàn |
| Untracked files | Có file lạ trong git status | Không stage file đó |
| Dangerous patterns | test.only, page.pause, credentials | Dừng, yêu cầu fix |
| TypeScript error | tsc --noEmit fail | Dừng hoàn toàn |
| Conflict | Rebase conflict | Dừng, chờ user resolve |
| Stage confirmation | Trước git add | Không stage |
| Commit message | Trước git commit | Không commit |
| Final push | Trước git push | Không push |

---

## UNCERTAINTY HANDLING

IF agent is unsure about any of the following → ASK, do not guess:
- File này có nên commit không?
- Commit message type có đúng không?
- Conflict này resolve thế nào?
- Branch đúng chưa?

Output format khi không chắc:
"⚠️ Cần xác nhận: [mô tả nghi vấn cụ thể]
 Lựa chọn:
 A. [option 1]
 B. [option 2]
 Bạn chọn gì?"

---

## ERROR REFERENCE

| Exit/Error | Meaning | Agent action |
|---|---|---|
| `non-fast-forward` | Remote ahead of local | Fetch + rebase, ask confirm |
| `CONFLICT` | Merge/rebase conflict | Stop, list files, wait |
| `nothing to commit` | No staged changes | Inform user, stop |
| `does not appear to be a git repository` | Wrong directory | Stop, inform user |
| `Permission denied` | SSH/auth issue | Stop, show error, ask user |
| TypeScript errors | Type mismatch | Stop, show errors |
| ESLint errors | Lint rule violation | Stop, show errors |
