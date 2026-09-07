import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

function Profile() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getProfile = async () => {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser()

      if (error) {
        console.error("Gagal mengambil akun:", error)
        setLoading(false)
        return
      }

      setUser(user)
      setLoading(false)
    }

    getProfile()
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-gray-500">
            Memuat profil...
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-red-500">
            Data akun tidak ditemukan.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">

        {/* Judul */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Profil Guru
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Informasi akun yang sedang digunakan
          </p>
        </div>

        {/* Card Profil */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Bagian atas */}
          <div className="bg-gray-50 p-6 flex items-center gap-5">

            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-4xl">
              👤
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800">
                Guru
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Akun Guru
              </p>
            </div>

          </div>

          {/* Informasi */}
          <div className="p-6">

            <div className="space-y-5">

              {/* Email */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Email
                </p>

                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  {user.email || "-"}
                </div>
              </div>

              {/* User ID */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  User ID
                </p>

                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 break-all">
                  {user.id}
                </div>
              </div>

              {/* Role */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Role
                </p>

                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  Guru
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  )
}

export default Profile