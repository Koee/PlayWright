# Agent Workflow, Scope, Code Change And Review Guide

Tai lieu nay gom cac quy tac lam viec cho agent trong repo Playwright nay: doc code co pham vi, lap kich ban truoc khi viet code, chinh sua code an toan, review code, va kiem soat quota/token.

## 1. Muc Tieu

Agent phai uu tien:

- Doc dung vung can xu ly, khong quet toan repo khi khong can.
- Lap kich ban ngan truoc khi sua code neu task co nhieu buoc hoac co rui ro.
- Sua code theo pattern san co cua repo.
- Verify bang lenh nho nhat co y nghia.
- Bao cao ngan gon, neu ro file da sua, cach verify, va pham vi chua dung toi.

Mac dinh lam viec theo che do tiet kiem quota:

```text
Doc hep truoc.
Mo rong chi khi co bang chung can thiet.
Chay test nho truoc.
Khong chay full suite neu chua can.
Khong refactor ngoai yeu cau.
```

### 1.1. Quan He Voi Superpowers

Trong repo nay, `AGENTS.md`, `Agent/question-first-scope-rules.md`, va file nay la workflow mac dinh. Superpowers chi la ho tro bo sung khi phu hop voi quy mo task.

- Khong dung full `superpowers:brainstorming` cho task nho, bugfix, review, giai thich code, sua data/config, hoac mo rong mot flow da co.
- Task nho chi dung Question-First Scope Rules, Scope Guard, va Test Selector.
- Chi dung full brainstorming khi tao cong viec lon moi can thiet ke tu dau, vi du viet test script cho chuc nang moi chua co pattern, tao workflow nhieu file moi, hoac khi user yeu cau brainstorm/design.
- Voi viec mo rong chuc nang da co, vi du them k6 performance cho test A da ton tai, bat dau tu file hien co va chi lap kich ban ngan neu thay doi cham nhieu file hoac co rui ro.
- Khong tao spec/plan trong `docs/superpowers/*`, khong commit, va khong them review gate theo Superpowers neu user khong yeu cau ro.

## 2. Nguyen Tac Doc Pham Vi

### 2.1. Bat Dau Tu Yeu Cau Cua User

Truoc khi doc file, agent can xac dinh:

- Muc tieu can dat la gi.
- File hoac folder nao user da chi dinh.
- Co duoc sua code hay chi phan tich.
- Co can chay test khong.
- Pham vi cam hoac nen tranh la gi.

Neu user chi dinh file cu the, chi doc cac file do truoc. Chi mo rong sang file khac khi co import, error, config, hoac dependency lien quan truc tiep.

### 2.2. Thu Tu Doc Cho Project Playwright Nay

Khi can hieu flow test:

```text
package.json
-> playwright.config.ts
-> config/*.config.ts
-> tests/**/*.spec.ts
-> steps/*.steps.ts
-> components/pages/*.ts
-> components/helpers/*.ts
-> constants/*.ts
-> utils/*.ts
```

Khong bat buoc doc het chuoi tren. Hay dung o tang dau tien da du thong tin de xu ly.

Vi du:

- Sua `.gitignore`: chi doc `.gitignore` va file/folder can ignore.
- Sua bien moi truong: doc `test-data/env/.env.example`, `config/env.config.ts`, va noi import bien do.
- Sua mot testcase: doc file spec, step lien quan, page object lien quan.
- Sua selector: doc page object va constants lien quan.
- Sua report/screenshot: doc helper/report utils lien quan.

### 2.3. Khi Nao Duoc Mo Rong Pham Vi

Chi mo rong neu gap mot trong cac dieu kien:

- File hien tai import hoac goi sang file khac.
- Loi test/log chi ro file khac.
- TypeScript error can truy nguoc type/helper.
- Behavior can doi chieu config Playwright hoac project config.
- User yeu cau review tong the.

Khi mo rong, agent nen noi ngan gon ly do:

```text
Can doc them components/pages/CheckoutPage.ts vi step dang goi method completeOrder o do.
```

## 3. Lap Kich Ban Truoc Khi Viet Code

Mac dinh, moi kich ban/plan do agent tao ra trong qua trinh phan tich, tao code, sua code, review, hoac verify phai duoc luu tap trung trong folder `Agent/`. Khong tao rai rac trong `docs/`, `rules/`, `tests/`, hoac folder khac tru khi user yeu cau ro.

Ten file kich ban nen dung dang:

```text
Agent/YYYY-MM-DD-<task-name>-scenario.md
Agent/YYYY-MM-DD-<task-name>-review.md
Agent/YYYY-MM-DD-<task-name>-verification.md
```

Neu kich ban chi la ghi chu ngan trong hoi thoai va user khong yeu cau luu file, agent co the khong tao file. Neu da tao file kich ban, phai dat trong `Agent/`.

Phan biet voi formal project plan:

- Kich ban/nhap/ghi chu tam cua agent: dat trong `Agent/`.
- Implementation plan chinh thuc cua du an: dat trong `docs/plans/YYYY-MM-DD-<feature-name>.md`.
- Live task tracker chinh thuc: dat trong `docs/plans/task.md`.
- `docs/superpowers/*` la legacy trong repo nay. Khong tao file moi tai day tru khi user yeu cau ro dung vi tri do.
- `docs/plans/task.md` phai ngan gon, chi ghi status/task; khong nhoi log dai, diff dai, hay chi tiet implementation.
- Khong commit spec/plan/doc/code neu user khong yeu cau ro.
- Khong tao user-facing guide/doc moi tru khi user yeu cau, hoac khi tao script/spec lap lai bat buoc cap nhat `docs/repo-command-guide.md`.

Nguyen tac chong phinh kich ban va tiet kiem quota:

- Voi thay doi nho cung flow da co plan/kich ban: chi them changelog ngan 3-5 dong vao cuoi plan/kich ban lien quan, khong viet them task dai.
- Voi thay doi lon khac huong hoac doi cau truc data/flow: tao plan/kich ban moi co ten ro nghia, vi du `Agent/YYYY-MM-DD-mlbl-gift-order-single-config-scenario.md` hoac formal plan theo folder user yeu cau.
- Voi docs hoac plan dai: khong doc toan file neu chi can sua mot doan; dung `rg`/`Select-String` tim heading lien quan roi patch dung doan.
- Neu file plan/kich ban dang qua dai, dung viec append chi tiet va tao file moi; trong file cu chi de link/ghi chu ngan tro sang file moi.

### 3.1. Khi Nao Can Lap Kich Ban

Can lap kich ban neu task:

- Tao testcase moi.
- Sua flow nhieu hon mot file.
- Dung toi config, env, fixture, auth, report, storage state.
- Co nguy co lam fail nhieu website/project.
- User yeu cau plan, spec, review gate.

Khong can lap kich ban dai neu task rat nho, vi du sua typo, them ignore pattern, doi mot selector ro rang.

### 3.2. Nguyen Tac Kich Ban Khi Tao Code

Khi task co tao code moi hoac sua flow, agent phai tao kich ban lam viec truoc khi edit. Kich ban khong can dai, nhung phai du de tranh vua code vua doan.

Nguyen tac:

- Verification-first: doc code/log/config trong pham vi truoc, khong doan hanh vi.
- Evidence over assumption: moi ket luan quan trong can co bang chung tu file, import, log, test, hoac command.
- Atomic steps: chia viec thanh cac buoc nho co the verify rieng.
- Every claim is testable: neu noi "da fix", phai co lenh verify hoac ly do chua verify.
- Failure mode explicit: neu buoc nao de fail, ghi fallback can lam tiep.
- User review gate: voi plan lon, cho user duyet truoc khi sua nhieu file.

### 3.3. Mau Kich Ban Ngan

```text
Muc tieu:
- Ket qua can dat.

Pham vi:
- File se doc/sua.

Khong lam:
- Viec ngoai scope, refactor, full test.

Huong sua:
- 2-5 buoc ngan.

Verify:
- Lenh nho nhat can chay.
```

### 3.4. Mau Kich Ban Tao Code

Dung mau nay khi tao testcase, API test, helper, page object, fixture, hoac flow moi:

```text
Kich ban tao code:

1. Entry point:
   - File bat dau doc:
   - Pattern tuong tu can doi chieu:

2. Hanh vi can tao:
   - Input:
   - Action:
   - Expected result:
   - Failure condition:

3. File se tao/sua:
   - tests/...:
   - steps/...:
   - components/pages hoac api helper:
   - constants/utils neu can:

4. Cac buoc implement:
   - Buoc 1:
   - Buoc 2:
   - Buoc 3:

5. Verify:
   - Typecheck/lint:
   - Spec/test nho nhat:
   - Khong chay:

6. Fallback neu fail:
   - Loi selector:
   - Loi env/config:
   - Loi API/data:
```

Neu task la API test, kich ban nen them:

```text
API scenario:
- Endpoint:
- Method:
- Auth/header:
- Payload source:
- Expected status:
- Expected response fields:
- Cleanup neu co tao data:
```

Neu task la UI test, kich ban nen them:

```text
UI scenario:
- Trang bat dau:
- State can setup:
- Selector chinh:
- User actions:
- Assertion:
- Screenshot/report khi fail:
```

### 3.5. Pre-flight Truoc Khi Sua Code

Truoc khi go dong code dau tien, agent nen kiem tra:

- Co hieu dung muc tieu va output user can chua.
- Pham vi doc/sua da du nho chua.
- Da tim pattern tuong tu trong repo chua.
- Da biet file entry point va file dependency truc tiep chua.
- Da biet verify nho nhat chua.
- Co can hoi user truoc khi sua nhieu file khong.

Khong can doc `git log` hoac toan bo config cho moi task. Chi dung khi task lien quan stale state, release history, hoac config chung.

### 3.6. Review Gate

Can hoi user truoc khi execute neu:

- Tao workflow/spec lon.
- Doi cau truc folder lon.
- Doi convention dat ten.
- Chay lenh co tac dong lon hoac ton thoi gian dai.
- Can commit/push.

Khong commit va khong push neu user khong yeu cau ro.

Khong tu tao brand moi, doi ten san pham, doi naming/identity cua san pham, hoac thay doi dinh huong product neu user chua yeu cau ro.

Giao tiep truc tiep voi user mac dinh bang tieng Viet. Code, comment, doc, plan khong bat buoc tieng Viet neu repo/pattern hien tai dang dung tieng Anh hoac mixed style.

### 3.7. Red Flags Trong Kich Ban

Neu kich ban co cac cum sau, agent nen sua lai cho ro va testable:

- `ensure`, `make sure`, `handle properly`, `appropriately` ma khong co expected result.
- File path chung chung, khong ghi ro file trong repo.
- Noi "tuong tu file cu" nhung khong neu file nao.
- Task gom qua nhieu viec trong mot buoc.
- Magic number khong co ly do.
- Thieu verify hoac fallback khi verify fail.
- Required va optional bi tron voi nhau.

## 4. Nguyen Tac Chinh Sua Code

### 4.1. Giu Pattern San Co

Trong repo nay, flow test nen giu 3 tang:

```text
tests/.../*.spec.ts
-> steps/...steps.ts
-> components/pages/...Page.ts
```

Quy uoc:

- Spec mong, chi khai bao scenario va goi step.
- Step dieu phoi business flow va expect.
- Page Object thao tac UI chi tiet: click, fill, wait, verify.
- Helper chi tao khi logic dung lai nhieu noi.
- Constants chua selector, label, regex dung chung.

### 4.2. Cau Truc File Theo Repo Hien Tai

Khi tao code moi, agent phai dat file theo cau truc hien co cua repo. Khong tao folder moi neu pattern da ton tai.

```text
AGENTS.md                         # Rule entry point cho agent
Agent/                            # Kich ban, plan, review note, verification note cua agent
playwright.config.ts              # Cau hinh Playwright chung
package.json                      # Scripts test/typecheck/tooling
config/                           # Env/config/project config
constants/                        # Selector, label, regex, constant dung chung
tests/
  api/                            # API specs
  checkout/                       # Checkout/UI checkout specs
  ui/                             # UI specs khac
steps/                            # Business flow orchestration
components/
  pages/                          # Page Object
  helpers/                        # Helper dung chung
  assertions/                     # Assertion helper dung lai
  sections/                       # Section/component object neu co
fixtures/                         # Playwright fixtures
setup/                            # Setup/global setup neu co
utils/                            # Utility/report/file helpers
types/                            # Shared TypeScript types
test-data/
  env/                            # .env va .env.example
  json/                           # Payload/data JSON
performance/
  k6/                             # K6 performance scripts/helpers theo repo hien tai
k6/                               # K6 support/config neu co
scripts/                          # Script chay tool/test/performance
reports/                          # Output report
test-results/                     # Output Playwright/test artifacts
playwright-report/                # HTML report output
docs/                             # Tai lieu nguoi dung/huong dan dai han
rules/                            # Rule cu/legacy neu con dung
```

Quy tac dat file:

- Kich ban/plan/review/verification do agent sinh ra: luu trong `Agent/`.
- API test moi: dat trong `tests/api/<domain>/<name>.spec.ts` neu da co domain, vi du `tests/api/checkout/`.
- UI/checkout test moi: dat trong `tests/checkout/` hoac `tests/ui/` theo feature.
- Flow nghiep vu: dat trong `steps/<feature>.steps.ts`.
- Page Object: dat trong `components/pages/<FeaturePage>.ts`.
- Helper dung chung: dat trong `components/helpers/`.
- Assertion dung lai: dat trong `components/assertions/`.
- Selector/label/regex dung chung: dat trong `constants/`.
- Type dung chung: dat trong `types/`.
- Payload/data test: dat trong `test-data/json/` hoac `test-data/env/`.
- Script K6/performance: dat theo pattern hien co trong `performance/k6/` va runner trong `scripts/` neu can.
- Tai lieu guide dai han cho user: dat trong `docs/`; khong dat kich ban agent tam thoi vao `docs/`.

Neu khong chac dat file o dau, agent phai tim file tuong tu bang `rg --files` hoac hoi user truoc khi tao folder moi.

### 4.3. Khi Nao Sua File Nao

- Them testcase moi: tao/sua file trong `tests`.
- Them flow nghiep vu: tao/sua file trong `steps`.
- Them thao tac UI: tao/sua Page Object trong `components/pages`.
- Selector/text dung lai: sua `constants`.
- Navigation/dialog/report/screenshot dung chung: sua `components/helpers` hoac `utils`.
- Env/config: sua `config` va `test-data/env`.

### 4.4. Quy Tac Sua Nho

- Chi sua dung hanh vi user yeu cau.
- Khong refactor style neu khong can.
- Khong doi ten public API neu khong bat buoc.
- Khong sua output report neu task khong lien quan.
- Khong xoa file/log/report neu user khong yeu cau.
- Neu gap dirty worktree, khong revert thay doi khong phai cua minh.

## 5. Nguyen Tac Review Code

Khi user yeu cau review, agent phai uu tien:

1. Bug hoac regression co the xay ra.
2. Rui ro flaky test, timeout, selector yeu.
3. Thieu assertion hoac testcase khong fail khi behavior sai.
4. Sai scope env/config/project.
5. Thieu verify hoac lenh test phu hop.

Format review nen la:

```text
Findings
- [Severity] file:line - Van de, vi sao quan trong, de xuat sua.

Open Questions
- Neu co.

Summary
- Tom tat ngan, khong thay the findings.
```

Neu khong thay issue, noi ro:

```text
Khong thay issue ro rang trong pham vi da review. Rui ro con lai: chua chay spec tren tat ca project.
```

## 6. Kiem Soat Quota Va Token

### 6.1. Nguyen Nhan Tieu Hao Quota Nhanh

Quota thuong tang nhanh vi:

- Doc qua nhieu file de phong sai.
- Quet toan repo thay vi doc file user chi dinh.
- Chay test/lint rong, output dai.
- Doc report/log/screenshot metadata qua nhieu.
- Giai thich dai trong khi user chi can ket qua.
- Mot task nho bi keo theo context cu cua hoi thoai.

### 6.2. Che Do Tiet Kiem Quota

Agent mac dinh nen ap dung:

- Doc toi thieu file can thiet.
- Task nho doc toi da 3-5 file; neu can hon 5 file phai noi ly do, hon 8 file phai dung hoi user.
- Dung `rg` de tim dung diem goi, khong mo file lon neu chua can.
- Doc doan lien quan thay vi toan file khi co the.
- Voi Playwright error context/report/log, doc error message, stack trace, ten testcase fail, va dong page snapshot lien quan truc tiep truoc; chi mo rong artifact khi cac doan nay chua du tim root cause.
- Voi plan/kich ban/docs dai, tim heading bang `rg`/`Select-String` roi patch doan lien quan; khong doc ca file neu khong can.
- Chay testcase `--grep` hoac spec don le thay vi full suite.
- Cat bot log, chi trich phan loi chinh.
- Bao cao ngan gon sau khi xong.
- Khong tao plan/scenario/verification note cho task chi phan tich hoac sua 1-2 file neu user khong yeu cau.
- Khong tao docs/guide moi neu user khong yeu cau hoac task khong tao command/spec lap lai can document.

Lenh verify uu tien:

```text
npx playwright test path/to/spec.ts
npm run typecheck
npx eslint path/to/file.ts
npx playwright test tests/path/to/file.spec.ts --project=<project-name> --grep "ten testcase fail"
npm test -- --grep "ten test"
```

Chi chay full suite khi:

- Sua config chung.
- Sua helper dung tren nhieu flow.
- User yeu cau.
- Spec don le pass nhung rui ro regression cao.

### 6.3. Quy Tac Run Testcase

Khi can verify, agent phai chon lenh nho nhat co y nghia theo thu tu:

```text
1. Typecheck/lint file neu thay doi lien quan TypeScript/static code.
2. Neu biet testcase fail ro ten, chay dung testcase bang `--grep` truoc.
3. Neu testcase `--grep` pass, chay ca spec/project lien quan khi can xac nhan regression trong spec do.
4. Chay mot project/site dai dien neu spec co nhieu project.
5. Chay 1-2 spec dai dien neu sua helper/config dung chung.
6. Chi chay full suite khi user yeu cau hoac thay doi co anh huong rong.
```

Lenh uu tien:

```text
npm run typecheck
npx eslint path/to/file.ts
npx playwright test tests/path/to/file.spec.ts --project=<project-name> --grep "ten testcase fail"
npx playwright test tests/path/to/file.spec.ts
npx playwright test tests/path/to/file.spec.ts --project=<project-name>
npm test
```

Quy tac khi chay testcase:

- Truoc khi chay, noi ro vi sao chon lenh do.
- Khong chay `npm test` hoac `npx playwright test` full suite neu chua can.
- Khong chay ca spec/project lien quan neu testcase `--grep` dang fail, tru khi can them artifact de debug hoac user yeu cau.
- Chi chay ca spec/project lien quan sau khi testcase `--grep` pass, thay doi cham nhieu testcase, hoac can xac nhan regression trong spec do.
- Neu test output dai, chi doc/trich loi chinh va file/line lien quan.
- Neu test fail 2 vong lien tiep, dung lai tom tat nguyen nhan va de xuat buoc tiep theo.
- Neu test can env/data that, kiem tra file env/data trong pham vi truoc khi chay.
- Neu test tao report/screenshot, khong xoa output tru khi user yeu cau.

### 6.4. Mau Prompt Cho User De Tiet Kiem Quota

Mau ngan:

```text
Che do tiet kiem quota.
Muc tieu: ...
Pham vi: chi doc/sua ...
Khong lam: khong refactor, khong chay full test.
Verify: chi chay ...
Output: root cause, file da sua, ket qua verify, rui ro con lai.
```

Vi du:

```text
Che do tiet kiem quota.
Fix loi trong tests/ui/checkout/copy-qr-content.spec.ts.
Chi doc spec, steps/copy.steps.ts va components/pages/CopyPage.ts.
Khong chay full suite.
Verify bang npx playwright test tests/ui/checkout/copy-qr-content.spec.ts --grep "ten testcase fail", sau do chay ca spec neu grep pass.
```

## 7. Agent De Xuat De Kiem Soat Chat Luong

### 7.1. Scope Guard Agent

Muc dich:

- Xac dinh pham vi file toi thieu truoc khi doc/sua.
- Canh bao khi agent sap mo rong qua nhieu.
- Yeu cau ly do neu muon doc them folder lon.

Quy tac:

```text
Neu task co file chi dinh, khong doc ngoai file do tru khi co import/error truc tiep.
Neu can doc ngoai scope, ghi ly do mot cau.
```

### 7.2. Test Selector Agent

Muc dich:

- Chon lenh verify nho nhat.
- Tranh chay full Playwright suite khong can thiet.
- De xuat spec/project grep phu hop.

Quy tac:

```text
Sua spec nao thi chay spec do.
Sua helper dung chung thi chay 1-2 spec dai dien truoc.
Full suite la buoc cuoi, khong phai mac dinh.
```

### 7.3. Quota Auditor Agent

Muc dich:

- Theo doi so file da doc, so command da chay, va output dai.
- Nhac dung lai neu task dang lan rong.
- De xuat tom tat context va tiep tuc bang scope hep.

Nguong goi y:

```text
Doc > 8 file cho task nho: can xac nhan scope.
Output command > 200 dong: chi lay phan loi chinh.
Playwright artifact/report dai: chi lay error, stack trace, testcase fail, va page snapshot lien quan truc tiep.
Qua 2 vong test fail: tom tat va doi chien luoc debug.
```

### 7.4. Review Gate Agent

Muc dich:

- Kiem tra truoc khi sua code co rui ro.
- Dam bao co plan ngan cho task nhieu file.
- Dam bao final co noi ro file sua va verify.

## 8. Workflow Chuan Cho Task Sua Code

```text
1. Xac dinh muc tieu va pham vi.
2. Doc file user chi dinh hoac file entry point.
3. Tim dependency truc tiep neu can.
4. Lap kich ban ngan neu task nhieu buoc.
5. Neu co tao code/sua flow, viet kich ban tao code truoc khi edit.
6. Sua code theo pattern san co.
7. Chay verify nho nhat.
8. Neu fail, doc loi chinh va sua vong tiep theo.
9. Bao cao file da sua, lenh verify, rui ro con lai.
```

## 9. Workflow Chuan Cho Task Tao Testcase Moi

```text
1. Xac dinh chuc nang can test va website/project ap dung.
2. Doc spec/step/page object gan nhat co pattern tuong tu.
3. Viet kich ban testcase truoc khi tao code: input, action, expected result, failure condition.
4. Xac dinh file se tao/sua va verify nho nhat.
5. Tao spec mong trong tests.
6. Tao step dieu phoi flow trong steps neu flow co nhieu buoc.
7. Tao hoac mo rong Page Object/API helper neu can.
8. Dua selector/text dung chung vao constants neu duoc dung lai.
9. Them expect de testcase fail khi behavior sai.
10. Neu tao test script/spec moi can chay thuong xuyen, them hoac cap nhat npm script trong `package.json` theo ten ro nghia, vi du `test:<feature>`.
11. Cap nhat `docs/repo-command-guide.md` dung flow lien quan. Bat buoc ghi ngan gon: muc dich, setup o file nao/env nao/config nao, lenh run, report/artifact sau khi chay.
    - Setup phai neu ro duong dan file, vi du `test-data/env/.env`, `config/test.config.ts`, file JSON trong `test-data/json`, token/auth env neu co.
    - Neu chi bo sung test script moi vao flow da co, khong doc lai toan bo guide/repo; chi sua dung section lien quan.
    - Chi doc/sua command cu khi test script moi anh huong `package.json`, config runner, project, grep tag, report path, hoac flow chay hien co.
12. Chay verify nho nhat: typecheck neu can va spec moi hoac npm script moi vua them.
```

## 10. Workflow Chuan Cho Task Tao API Test

```text
1. Xac dinh endpoint, method, auth/header, payload, expected status.
2. Doc API test gan nhat co pattern tuong tu.
3. Viet API scenario truoc khi tao code.
4. Xac dinh data source: env, fixture, payload inline, hoac file test-data.
5. Tao/sua spec trong tests/api.
6. Dua helper dung chung vao utils/components/helpers neu duoc dung lai.
7. Assert status, response schema/fields, va loi nghiep vu quan trong.
8. Neu test tao data, ghi ro cleanup hoac ly do khong cleanup.
9. Neu tao test script/spec moi can chay thuong xuyen, them hoac cap nhat npm script trong `package.json` theo ten ro nghia, vi du `test:api-<feature>`.
10. Cap nhat `docs/repo-command-guide.md` dung flow lien quan. Bat buoc ghi ngan gon: muc dich, setup o file nao/env nao/config nao, lenh run, report/artifact sau khi chay.
    - Setup phai neu ro duong dan file, vi du `test-data/env/.env`, `config/test.config.ts`, file JSON trong `test-data/json`, token/auth env neu co.
    - Neu chi bo sung API test moi vao flow da co, khong doc lai toan bo guide/repo; chi sua dung section lien quan.
    - Chi doc/sua command cu khi API test moi anh huong `package.json`, config runner, project, grep tag, report path, hoac flow chay hien co.
11. Chay spec API nho nhat, khong chay full suite neu chua can.
```

## 11. Checklist Truoc Khi Ket Thuc

- Da giu dung pham vi user yeu cau.
- Da khong sua file ngoai scope neu khong co ly do.
- Da lap kich ban tao code neu task co tao/sua flow.
- Da khong chay full test neu khong can.
- Da verify bang lenh nho nhat co y nghia.
- Da neu ro neu khong chay duoc test.
- Da khong commit/push neu user khong yeu cau.
- Final ngan gon, neu ro root cause, file da tao/sua, ket qua verify, va rui ro con lai.
