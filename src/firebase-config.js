// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk",
  authDomain: "rewards-63e43.firebaseapp.com",
  projectId: "rewards-63e43",
  storageBucket: "rewards-63e43.firebasestorage.app",
  messagingSenderId: "453256410249",
  appId: "1:453256410249:web:b7edd6afe3922c3e738258"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export { storage };
