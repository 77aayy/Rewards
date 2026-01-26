# 🔒 Security Guide - Firebase API Key Protection

## ⚠️ Important Security Notice

The Firebase API key in this project is **intended to be public** (client-side). However, it is **protected** by:

1. **API Key Restrictions** in Google Cloud Console
2. **Firebase Security Rules** for Storage and Firestore
3. **Domain Restrictions** (only works on authorized domains)

## ✅ Security Measures Applied

### 1. API Key Restrictions (Required)
Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and:

1. Find your API key: `AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk`
2. Click **Edit**
3. Under **Application restrictions**:
   - Select **HTTP referrers (web sites)**
   - Add: `https://rewards-63e43.web.app/*`
   - Add: `https://rewards-63e43.firebaseapp.com/*`
   - Add: `http://localhost:*` (for development)
4. Under **API restrictions**:
   - Select **Restrict key**
   - Select only: **Firebase Storage API**
5. Click **Save**

### 2. Firebase Security Rules
- Storage rules are in `storage.rules`
- Only authorized operations are allowed

### 3. Admin Access Protection
- Admin access requires secret key: `?admin=ayman5255`
- Employee access requires unique code: `?code=XXXX`

## 🔐 Best Practices

1. **Never commit sensitive data** to public repositories
2. **Always use API key restrictions** in Google Cloud Console
3. **Monitor API usage** in Google Cloud Console
4. **Rotate keys** if compromised

## 📝 Notes

- Firebase Client SDK requires API key in frontend code
- API key is safe when properly restricted
- Security comes from restrictions, not hiding the key
