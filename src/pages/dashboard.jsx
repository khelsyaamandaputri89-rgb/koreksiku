import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { useNavigate } from "react-router-dom"

function dashboard() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchDashboard() {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser()

      if (!user) {
        navigate("/login")
        return
      }

      // Ambil profile guru
      const {
        data: profileData,
        error: profileError
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error(
          "Profile error:",
          profileError
        )
      }

      setProfile(profileData)

      // Ambil soal milik guru
      const {
        data: questionData,
        error: questionError
      } = await supabase
        .from("questions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false
        })

      if (questionError) {
        console.error(
          "Question error:",
          questionError
        )
      }

      setQuestions(questionData || [])

    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-gray-500">
          Memuat dashboard...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Selamat datang, {profile?.name || "Guru"} 👋
        </h1>

        <p className="text-gray-500 mt-2">
          Kelola soal dan koreksi lembar jawaban siswa.
        </p>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">
            Total Soal
          </p>

          <h2 className="text-3xl font-bold text-gray-800 mt-2">
            {questions.length}
          </h2>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">
            Lembar Dikoreksi
          </p>

          <h2 className="text-3xl font-bold text-gray-800 mt-2">
            0
          </h2>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">
            Rata-rata Nilai
          </p>

          <h2 className="text-3xl font-bold text-gray-800 mt-2">
            -
          </h2>
        </div>

      </div>

      {/* Soal terbaru */}
      <div className="bg-white border border-gray-200 rounded-xl">

        <div className="p-5 border-b border-gray-100 flex items-center justify-between">

          <div>
            <h2 className="font-semibold text-gray-800">
              Soal Terbaru
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Soal yang baru kamu buat.
            </p>
          </div>

          <button
            onClick={() =>
              navigate("/questions")
            }
            className="text-sm font-medium text-gray-700 hover:underline"
          >
            Lihat semua
          </button>

        </div>

        {questions.length === 0 ? (

          <div className="p-8 text-center text-gray-500">
            Belum ada soal.
          </div>

        ) : (

          <div className="divide-y divide-gray-100">

            {questions.slice(0, 5).map(
              (question) => (

                <div
                  key={question.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >

                  <div>

                    <h3 className="font-medium text-gray-800">
                      {question.title}
                    </h3>

                    <p className="text-sm text-gray-500 mt-1">
                      Kelas {question.class_name}
                      {" • "}
                      {question.total_questions} soal
                    </p>

                  </div>

                  <button
                    onClick={() =>
                      navigate("/correction", {
                        state: {
                          questionId: question.id
                        }
                      })
                    }
                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    Koreksi
                  </button>

                </div>

              )
            )}

          </div>

        )}

      </div>

    </div>
  )
}

export default dashboard