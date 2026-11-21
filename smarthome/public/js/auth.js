
(async () => {
  // 1. Periksa library Supabase
  const clientLib = window.supabase;

  if (!clientLib?.createClient) {
    console.error("Library Supabase belum dimuat.");
    return;
  }

  // 2. Ambil konfigurasi dari backend
  let config;

  try {
    const response = await fetch("/api/config");

    if (!response.ok) {
      throw new Error("Gagal mengambil konfigurasi Supabase.");
    }

    config = await response.json();
  } catch (error) {
    console.error("Gagal mengambil konfigurasi:", error);
    return;
  }

  const url = config.supabaseUrl;
  const anonKey = config.supabaseAnonKey;

  if (!url || !anonKey) {
    console.error("Konfigurasi Supabase belum diisi di .env");
    return;
  }

  // 3. Inisialisasi Supabase
  const supabaseClient = clientLib.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window.supabaseClient = supabaseClient;

  // 4. Deteksi halaman
  const currentPage = location.pathname.split("/").pop();

  const isLoginPage = currentPage === "login.html";
  const isHomePage =
    currentPage === "index.html" || currentPage === "";

  // 5. Ambil session
  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) {
    console.error("Gagal memeriksa session:", error);
  }

  const session = data?.session;

  // 6. Jika belum login, arahkan ke login
  if (!session && !isLoginPage) {
    location.replace("/login.html");
    return;
  }

  // 7. Jika sudah login dan membuka login, arahkan ke home
  if (session && isLoginPage) {
    location.replace("/index.html");
    return;
  }

  // 8. Tandai halaman sudah terautentikasi
  if (session) {
    document.documentElement.classList.add("authenticated");
  }

  // 9. Logout
  const logoutButton =
    document.getElementById("logoutButton");

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      console.error("Gagal logout:", error.message);
      logoutButton.disabled = false;
      alert("Gagal logout. Silakan coba lagi.");
      return;
    }

    location.replace("/login.html");
  });

  // 10. Jika bukan halaman login, hentikan
  if (!isLoginPage) return;

  // 11. Ambil elemen form login
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  const submit = document.getElementById("signInButton");
  const password = document.getElementById("password");
  const showPassword =
    document.getElementById("togglePassword");

  // 12. Toggle password
  showPassword?.addEventListener("click", () => {
    const visible = password.type === "text";

    password.type = visible ? "password" : "text";

    showPassword.setAttribute(
      "aria-label",
      visible ? "Tampilkan password" : "Sembunyikan password"
    );
  });

  // 13. Proses login
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!message || !submit) return;

    message.textContent = "";
    submit.disabled = true;

    const buttonText =
      submit.querySelector("span:first-child");

    if (buttonText) {
      buttonText.textContent = "Signing In...";
    }

    const email = form.querySelector("#email").value.trim();
    const pass = password.value;

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password: pass
        });

      if (error) {
        message.textContent =
          error.message === "Invalid login credentials"
            ? "Email atau password salah. Periksa kembali akun kamu."
            : error.message;

        submit.disabled = false;

        if (buttonText) {
          buttonText.textContent = "Sign In";
        }

        return;
      }

      if (data.session) {
        location.replace("/index.html");
      }
    } catch (error) {
      console.error("Login gagal:", error);

      message.textContent =
        "Terjadi kesalahan. Silakan coba lagi.";

      submit.disabled = false;

      if (buttonText) {
        buttonText.textContent = "Sign In";
      }
    }
  });
})();
