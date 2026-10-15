// ==========================================
        // SESSION CHECK — must run before Firebase init
        // Allows localStorage fallback while Firebase initializes
        // ==========================================
        (function () {
            try {
                var session = localStorage.getItem('nsa_session');
                if (!session) {
                    window.location.replace('login.html');
                    return;
                }
                window.sessionValidated = true;
            } catch (e) {
                window.location.replace('login.html');
                return;
            }
        })();

        // ==========================================
        // FIREBASE CONFIG
        // ==========================================
        const firebaseConfig = {
            apiKey: "AIzaSyAskVmKXim1oW75lrmSpBL2QnjHidRH9lA",
            authDomain: "nameer-school--of-accountancy.firebaseapp.com",
            projectId: "nameer-school--of-accountancy",
            storageBucket: "nameer-school--of-accountancy.firebasestorage.app",
            messagingSenderId: "594772166032",
            appId: "1:594772166032:web:8bc331f57bf04620f9df15",
            measurementId: "G-0PMZEG6F78"
        };

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();

        // Listen for auth state changes (for sign-out, token refresh, etc.)
        auth.onAuthStateChanged(function(user) {
            if (!user) {
                // No Firebase user - only redirect if we never validated a session
                if (!window.sessionValidated) {
                    try {
                        var session = localStorage.getItem('nsa_session');
                        if (!session) {
                            window.location.replace('login.html');
                        }
                    } catch (e) {
                        window.location.replace('login.html');
                    }
                }
            }
        });