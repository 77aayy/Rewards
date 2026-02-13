# ربط المشروع بـ GitHub (مرة واحدة)

المستودع Git جاهز والـ commit الأول تم. لرفع الكود على GitHub:

## 1) إنشاء مستودع على GitHub

- ادخل [github.com](https://github.com) → New repository.
- اسم المستودع كما تريد (مثلاً `elite-rewards`).
- **لا** تضف README أو .gitignore (المشروع عنده بالفعل).
- انسخ رابط المستودع، مثلاً: `https://github.com/USERNAME/elite-rewards.git`

## 2) ربط المشروع بالمستودع

من **جذر المشروع** (المجلد اللي فيه `deploy-github-firebase.bat`):

```bash
git remote add origin https://github.com/USERNAME/REPO-NAME.git
```

غيّر `USERNAME` و `REPO-NAME` حسب مستودعك.

## 3) الرفع أول مرة

```bash
git push -u origin master
```

(لو الفرع عندك `main` استبدل `master` بـ `main`.)

## بعد كده

شغّل **`deploy-github-firebase.bat`** من جذر المشروع: ينشر على Firebase ثم يعمل commit و push إلى GitHub.
