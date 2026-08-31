import { useState } from "react"
import { supabase } from "../services/supabase"
import { useNavigate } from "react-router-dom"

function Register() {
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function handleRegister(e) {
    e.preventDefault()

    setError("")
    setSuccess("")
    setLoading(true)

   const {
        data,
        error
    } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
            name: name,
            },
        },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(
      "Registrasi berhasil! Silakan login."
    )

    setLoading(false)

    setTimeout(() => {
      navigate("/login")
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">

        <div className="text-center mb-8">

          <h1 className="text-3xl font-bold text-gray-800">
            KoreksiKu
          </h1>

          <p className="text-gray-500 mt-2">
            Buat akun guru
          </p>

        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-600 text-sm">
            {success}
          </div>
        )}

        <form
          onSubmit={handleRegister}
          className="space-y-4"
        >

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Guru
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan nama"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guru@email.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              minLength={6}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition disabled:opacity-50"
          >
            {loading ? "Mendaftarkan..." : "Daftar"}
          </button>

        </form>

        <p className="text-center text-sm text-gray-500 mt-6">

          Sudah punya akun?{" "}

          <button
            onClick={() => navigate("/login")}
            className="font-medium text-gray-800 hover:underline"
          >
            Login
          </button>

        </p>

      </div>

    </div>
  )
}

export default Register