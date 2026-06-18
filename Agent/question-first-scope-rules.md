# Question-First Scope Rules

Tai lieu nay la bo quy tac dat cau hoi va xac dinh pham vi truoc khi agent doc file, sua code, chay test, hoac review trong repo Playwright nay.

## 1. Nguyen Tac Mac Dinh

Truoc khi lam task, agent phai xac dinh 5 thong tin:

```text
Muc tieu: viec can dat duoc la gi?
Pham vi: file/folder nao duoc doc hoac sua?
Khong lam: viec nao can tranh?
Verify: lenh nao duoc chay, neu can?
Output: user muon nhan ket qua theo dang nao?
```

Neu user da cung cap du 5 thong tin tren, agent bat dau lam ngay.

Neu thieu thong tin nhung co the suy luan an toan tu context, agent duoc phep lam theo gia dinh nho va noi ro gia dinh do.

Neu thieu thong tin va viec suy luan co the gay doc rong, sua nham, chay test qua lon, hoac ton quota, agent phai hoi truoc.

## 2. Khi Nao Phai Hoi Truoc

Agent phai hoi truoc khi:

- Pham vi file/folder chua ro va task co the dung nhieu khu vuc.
- User yeu cau "kiem tra project", "fix loi", "toi uu", "review" nhung khong chi file/log.
- Can chay full test suite, full lint, hoac command co output lon.
- Can sua config chung, env, fixture, auth, storage state, reporter, helper dung chung.
- Can tao folder/file quy tac moi anh huong cach lam viec sau nay.
- Can tao brand moi, doi ten san pham, hoac thay doi product identity.
- Can commit, push, reset, delete, move file lon, hoac thao tac co tinh pha huy.
- Can doc file ngoai workspace hoac file khong nam trong pham vi user neu khong co ly do truc tiep.

Cau hoi nen ngan, tap trung vao quyet dinh dang chan:

```text
Ban muon toi gioi han trong file A/B, hay cho phep mo rong sang config va helpers neu can?
```

## 3. Khi Nao Khong Can Hoi

Agent khong can hoi neu:

- User da chi ro file va viec can lam.
- Mo rong sang file import truc tiep tu file dang doc.
- Error/log/stack trace chi ro file can doc tiep.
- Thay doi la tai lieu hoac typo trong dung file user dang yeu cau.
- Verify la lenh nho va dung pham vi, vi du chay mot spec cu the.

Trong truong hop nay, agent chi can noi ngan gon ly do neu mo rong:

```text
Doc them components/pages/CopyPage.ts vi steps/copy.steps.ts import truc tiep class nay.
```

## 4. Mau Cau Hoi Truoc Khi Lam

Khi task chua ro, agent nen hoi theo mau:

```text
De tiet kiem quota, ban muon toi bat dau voi pham vi nao?

Muc tieu: toi hieu la ...
Pham vi de xuat: ...
Khong lam de xuat: khong refactor, khong chay full test.
Verify de xuat: ...
```

Neu user muon nhanh, agent co the de xuat mac dinh:

```text
Neu ban dong y, toi se bat dau trong pham vi nho nhat: file user dang mo va file import truc tiep.
```

## 5. Cach Xu Ly Khi User Khong Chac Pham Vi

Neu user noi khong chac pham vi, agent ap dung "pham vi mem":

```text
Pham vi ban dau: file/folder user nghi lien quan.
Mo rong cho phep: file import truc tiep, file xuat hien trong error/log, config can thiet.
Mo rong lon: hoi user truoc.
```

Vi du:

```text
Muc tieu: tim nguyen nhan checkout fail.
Pham vi ban dau: tests/ui/checkout/invoice.spec.ts va steps/checkout.steps.ts.
Neu thieu: chi mo rong sang file import truc tiep hoac file xuat hien trong stack trace.
Khong lam: khong refactor, khong chay full suite.
Verify: de xuat lenh nho nhat truoc.
```

## 6. Scope Guard Rules

Scope Guard co nhiem vu chan viec doc/sua lan rong.

Quy tac:

- Bat dau tu pham vi user neu co.
- Neu khong co pham vi, bat dau tu entry point nho nhat.
- Moi lan mo rong phai co ly do: import, error, log, config, type, hoac dependency truc tiep.
- Neu mo rong qua 3 khu vuc moi, dung lai tom tat va hoi user.
- Khong doc toan repo chi de "cho chac".
- Khong sua file ngoai scope neu chua co ly do ro.

Mau thong bao mo rong:

```text
Pham vi hien tai chua du. Can doc them config/projects.config.ts vi Playwright project name duoc lay tu do.
```

## 7. Test Selector Rules

Test Selector co nhiem vu chon lenh verify nho nhat.

Quy tac:

- Sua file spec nao thi uu tien chay spec do.
- Sua step nao thi chay spec goi step do.
- Sua Page Object nao thi chay spec dai dien lien quan.
- Sua constants selector thi chay spec dung selector do.
- Sua config/env chung thi chay typecheck va mot spec dai dien truoc.
- Chi chay full suite khi user yeu cau hoac khi thay doi co anh huong rong.

Mau lenh uu tien:

```text
npx playwright test tests/path/to/file.spec.ts
npm run typecheck
npx eslint path/to/file.ts
```

## 8. Quota Safety Rules

Agent phai canh bao hoac dung lai hoi user khi:

- Task nho nen doc toi da 3-5 file. Neu can hon 5 file, phai noi ly do mo rong truoc khi doc tiep.
- Task nho nhung da can doc hon 8 file thi phai dung lai, tom tat hien trang, va hoi user truoc khi mo rong.
- Command output qua dai va khong con tap trung vao loi chinh.
- Da chay hon 2 vong verify fail ma chua co huong moi.
- Can doc report/log lon thay vi phan loi chinh.
- Can chay full suite de xac nhan.
- Can doc docs/plan/log dai nhung chi lien quan mot heading; phai dung `rg`/`Select-String` va doc dung doan.
- Task chi phan tich hoac sua 1-2 file thi khong tao plan/scenario/verification note tru khi user yeu cau.

Mau dung lai:

```text
Pham vi dang mo rong qua muc can thiet cho task ban dau. Toi de xuat tom tat hien trang va xin phep mo rong tiep.
```

## 9. Mau Prompt User Nen Dung

Mau tiet kiem quota:

```text
Ap dung Agent/question-first-scope-rules.md va Agent/agent-workflow-scope-guide.md.
Bat Scope Guard + Test Selector.

Muc tieu: ...
Pham vi: chi ...
Khong lam: khong refactor, khong chay full test.
Verify: ...
Output: tom tat ngan file da sua va ket qua verify.
```

Mau khi chua chac pham vi:

```text
Ap dung Question-First Scope Rules.
Toi chua chac pham vi.

Muc tieu: ...
Pham vi ban dau: ...
Neu thieu: chi mo rong theo import/error/log va bao ly do.
Khong lam: khong refactor, khong chay full suite.
Verify: de xuat lenh nho nhat truoc.
```

## 10. Ket Qua Mong Doi

Neu ap dung dung bo quy tac nay, agent se:

- Hoi truoc khi task mo hoac rui ro.
- Bat dau bang pham vi nho nhat hop ly.
- Mo rong co bang chung.
- Tranh doc toan repo khong can.
- Tranh chay test qua rong.
- Giam quota/token nhung van giu du do an toan khi sua code.
