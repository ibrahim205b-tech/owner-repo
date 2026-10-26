# مطعم الحجي: موقع المنيو والطلب

موقع ثابت يُستضاف مجاناً على GitHub Pages، ويستخدم Supabase (مجاني) لقاعدة البيانات وتسجيل دخول الزبائن بحساب Gmail والموظفين بالبريد وكلمة المرور.

## كيف يعمل

1. الزبون يتصفح المنيو بدون تسجيل دخول.
2. عند الطلب يسجل دخوله بحساب Gmail، ثم يحدد موقعه بدقة على الخريطة، ويكتب رقم هاتفه وأقرب نقطة دالة عليه، ويختار الأطباق.
3. الطلب يصل فوراً إلى تطبيق المطعم على هاتف الموظف (انظر `android-staff/`).
4. الموظف يقبل الطلب أو يرفضه (مع سبب اختياري)، ثم يغيّر حالته حتى التسليم.
5. يرى الزبون حالة طلبه على الموقع فوراً، مثل «المطعم استلم طلبك وراح يجهزه لك بكل حب».

## الملفات

- `index.html`: المنيو والسلة والدخول بـ Gmail وإرسال الطلب، ومتابعة الطلبات.
- `staff.html`: شاشة الطلبات للموظفين، وهي التي يعرضها تطبيق المطعم.
- `admin.html`: لوحة إدارة المنيو (الأسعار والأصناف والأقسام) والطلبات.
- `android-staff/`: مشروع تطبيق أندرويد يعرض `staff.html` ويُبنى كملف APK.
- `supabase/schema.sql`: الجداول وصلاحيات الوصول ودوال إنشاء الطلب وتغيير حالته.
- `supabase/seed.sql`: الأقسام والأصناف والأسعار من القائمة الرسمية (16 قسماً، 100 صنف، 15 خيار حجم).
- `assets/js/config.js`: إعدادات الموقع (رابط Supabase، والمفتاح العام، ورقم واتساب).

## أ) إعداد قاعدة البيانات (مرة واحدة)

1. أنشئ مشروعاً جديداً على https://supabase.com (خطة مجانية).
2. من **SQL Editor** ثم **New query**، الصق محتوى `supabase/schema.sql` واضغط Run.
3. في query جديد، الصق محتوى `supabase/seed.sql` واضغط Run. يمكن تشغيله أكثر من مرة دون تكرار الأصناف.
4. من **Authentication > Providers > Email** عطّل التسجيل الذاتي (Allow new users to sign up)، حتى لا يستطيع أحد إنشاء حساب موظف.
5. أنشئ حساب كل موظف من **Authentication > Users > Add user** بالبريد وكلمة المرور.
6. لكل موظف أو مدير شغّل في **SQL Editor** التالي، مع تغيير البريد:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'staff@example.com'
   on conflict do nothing;
   ```

7. من **Project Settings > API** انسخ **Project URL** و**anon public key** فقط. لا تنسخ `service_role` أبداً.

## ب) تفعيل الدخول بحساب Gmail للزبائن

1. افتح https://console.cloud.google.com وأنشئ مشروعاً جديداً.
2. من **APIs & Services > OAuth consent screen** اختر External، واكتب اسم التطبيق «مطعم الحجي» وبريد الدعم. ثم اضغط **Publish app** حتى يستطيع أي زبون بحساب Gmail الدخول.
3. من **Credentials > Create credentials > OAuth client ID** اختر **Web application**.
4. في **Authorized redirect URIs** أضف رابط Supabase الخاص بمشروعك:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   (يظهر في Supabase ضمن **Authentication > Providers > Google**).
5. انسخ **Client ID** و**Client Secret**، والصقهما في Supabase ضمن **Authentication > Providers > Google**، ثم فعّل المزود.
6. من Supabase **Authentication > URL Configuration** ضع:
   - **Site URL**: `https://ibrahim205b-tech.github.io/owner-repo/`
   - **Redirect URLs**: نفس الرابط السابق.

## ج) ربط الموقع

افتح `assets/js/config.js` وضع القيم:

```js
window.HAJJI_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ...",
  whatsapp: "9647701234567", // رقم المطعم بدون +
  restaurantName: "مطعم الحجي",
};
```

قبل ملء هذه القيم يعرض الموقع المنيو كاملاً، لكن الطلب والدخول يبقيان غير متاحين.

## د) النشر على GitHub Pages

1. ارفع الملفات إلى المستودع على الفرع `main`.
2. من **Settings > Pages** اختر **Deploy from a branch**، ثم الفرع **main** والمجلد **/ (root)**.
3. بعد دقيقة يصبح الموقع على `https://ibrahim205b-tech.github.io/owner-repo/`.
4. صفحة الموظفين: `https://ibrahim205b-tech.github.io/owner-repo/staff.html`.

## هـ) تطبيق المطعم على الهاتف

راجع `android-staff/README.md` لبناء ملف APK وتثبيته على هاتف المطعم.

## و) الأمان

- الأسعار تُقرأ من قاعدة البيانات داخل `create_order`، ولا يقبل الخادم أي سعر من المتصفح.
- لا يستطيع أحد إنشاء طلب بدون تسجيل دخول، ولا يرى الزبون إلا طلباته.
- تغيير حالة الطلب يتم فقط عبر `set_order_status` للموظفين المسجّلين، وتسير الحالات بترتيب محدد.
- الأصناف لا تُحذف، بل تُخفى، فتبقى الطلبات القديمة كما هي. والفواتير تحفظ الاسم والسعر وقت الطلب.
- الحد الأقصى للطلبات المفتوحة للزبون الواحد ثلاثة، للحد من الإساءة.
- المستودع عام، لذلك لا تضع فيه أي مفتاح سري.

## ملاحظات

- خطة Supabase المجانية قد تُوقف المشروع بعد فترة بدون نشاط، ويمكن إعادة تشغيله من لوحة Supabase.
- الدخول بحساب Gmail يتطلب أن يكون الزبون مالكاً لحساب Gmail، ولا يتحقق رقم الهاتف، لذلك نعتمد على الرقم للتواصل فقط.
- تنبيهات الطلبات في تطبيق المطعم تعمل أثناء فتح التطبيق. للتنبيه حتى والتطبيق مغلق نحتاج إلى Firebase.
