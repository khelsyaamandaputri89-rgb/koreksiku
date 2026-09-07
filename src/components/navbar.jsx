import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"

function Navbar({onMenuClick}) {
  const [openProfile, setOpenProfile] = useState(false)
  const profileRef = useRef(null)

  // Tutup dropdown kalau klik di luar
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setOpenProfile(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Logout
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error("Logout gagal:", error)
      alert("Gagal keluar dari akun.")
      return
    }

    // Kembali ke halaman login
    window.location.href = "/login"
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      
      {/* KIRI */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden text-2xl"
        >
          ☰
        </button>

        <h2 className="text-lg font-semibold text-gray-800">
          KoreksiKu
        </h2>
      </div>

      {/* KANAN */}
      <div
        className="relative"
        ref={profileRef}
      >
        {/* Tombol Profil */}
        <button
          onClick={() => setOpenProfile(!openProfile)}
          className="flex items-center gap-3 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition"
        >
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
            👤
          </div>

          <span className="hidden sm:block text-sm font-medium text-gray-700">
            Guru
          </span>

          <span
            className={`hidden sm:block text-xs transition-transform ${
              openProfile ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {/* DROPDOWN */}
        {openProfile && (
          <div className="absolute right-0 top-14 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
            
            {/* Header Dropdown */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                Guru
              </p>

              <p className="text-xs text-gray-500 mt-1">
                Akun Guru
              </p>
            </div>

            {/* Profil */}
            <button
              onClick={() => {
                setOpenProfile(false)
                window.location.href = "/profile"
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-left"
            >
              <span>👤</span>
              <span>Profil</span>
            </button>

            {/* Logout */}
            <div className="border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 text-left"
              >
                <span>🚪</span>
                <span>Keluar</span>
              </button>
            </div>

          </div>
        )}
      </div>

    </header>
  )
}

export default Navbar