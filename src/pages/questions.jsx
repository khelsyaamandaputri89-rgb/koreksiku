import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { useNavigate } from "react-router-dom"

function questions() {
  const navigate = useNavigate()

  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchQuestions() {
    setLoading(true)

    const {
      data: {
        user
      }
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    const {
      data,
      error
    } = await supabase
      .from("questions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false
      })

    if (error) {
      console.error(error)
    }

    setQuestions(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchQuestions()
  }, [])

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Soal
          </h1>

          <p className="text-gray-500 mt-1">
            Kelola soal dan kunci jawaban kamu.
          </p>
        </div>

        <button
          onClick={() =>
            navigate("/questions/create")
          }
          className="w-full sm:w-auto px-5 py-3 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-700"
        >
          + Buat Soal
        </button>

      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {loading ? (

          <div className="p-10 text-center text-gray-500">
            Memuat soal...
          </div>

        ) : questions.length === 0 ? (

          <div className="p-10 text-center">

            <div className="text-5xl mb-4">
              📝
            </div>

            <h2 className="text-lg font-semibold text-gray-800">
              Belum ada soal
            </h2>

            <p className="text-gray-500 mt-1 mb-5">
              Buat soal pertama kamu untuk mulai menggunakan KoreksiKu.
            </p>

            <button
              onClick={() =>
                navigate("/questions/create")
              }
              className="px-5 py-3 rounded-lg bg-gray-800 text-white"
            >
              Buat Soal
            </button>

          </div>

        ) : (

          <div className="divide-y divide-gray-100">

            {questions.map((question) => (

              <div
                key={question.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >

                <div>

                  <h2 className="font-semibold text-gray-800">
                    {question.title}
                  </h2>

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
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Koreksi
                </button>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>
  )
}

export default questions