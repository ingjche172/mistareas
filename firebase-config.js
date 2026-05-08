// =============================================
// CONFIGURACIÓN DE FIREBASE — MisTareas
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyCUVLJYdr9FTWGBv7C_zRm6hAv0VVov608",
  authDomain: "mistareas-55602.firebaseapp.com",
  projectId: "mistareas-55602",
  storageBucket: "mistareas-55602.firebasestorage.app",
  messagingSenderId: "700366086745",
  appId: "1:700366086745:web:09c573ffe09c2ae0b7c748"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log('✅ Firebase conectado — MisTareas');
