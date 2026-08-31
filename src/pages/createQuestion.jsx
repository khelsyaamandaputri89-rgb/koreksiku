import { useState } from "react"
import { supabase } from "../services/supabase"
import { useNavigate } from "react-router-dom"

function createQuestion() {
  const navigate = useNavigate()

  const [title, setTitle] = useState("")
  const [className, setClassName] = useState("")
  const [totalQuestions, setTotalQuestions] = useState(10)

  const [answers, setAnswers] = useState(
    Array(10).fill("")
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function handleTotalQuestionsChange(e) {
    const total = Number(e.target.value)

    if (total < 1) return

    setTotalQuestions(total)

    setAnswers((currentAnswers) => {
      const newAnswers = [...currentAnswers]

      if (total > newAnswers.length) {
        while (newAnswers.length < total) {
          newAnswers.push("")
        }
      } else {
        newAnswers.length = total
      }

      return newAnswers
    })
  }

  function handleAnswerChange(index, value) {
    setAnswers((currentAnswers) => {
      const newAnswers = [...currentAnswers]

      newAnswers[index] = value

      return newAnswers
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    setError("")
    setLoading(true)

    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser()

      if (!user) {
        setError("Kamu belum login.")
        setLoading(false)
        return
      }

      const emptyAnswer = answers.some(
        (answer) => !answer
      )

      if (emptyAnswer) {
        setError(
          "Semua kunci jawaban harus diisi."
        )
        setLoading(false)
        return
      }

      // Simpan soal
      const {
        data: question,
        error: questionError
      } = await supabase
        .from("questions")
        .insert({
          user_id: user.id,
          title: title,
          class_name: className,
          total_questions: totalQuestions,
        })
        .select()
        .single()

      if (questionError) {
        throw questionError
      }

      // Siapkan kunci jawaban
      const answerKeyData = answers.map(
        (answer, index) => ({
          question_id: question.id,
          question_number: index + 1,
          answer: answer,
        })
      )

      // Simpan kunci jawaban
      const {
        error: answerKeyError
      } = await supabase
        .from("answer_keys")
        .insert(answerKeyData)

      if (answerKeyError) {
        throw answerKeyError
      }

      navigate("/questions")

    } catch (error) {
      console.error(error)

      setError(
        error.message || "Gagal menyimpan soal."
      )
    }

    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Buat Soal
        </h1>

        <p className="text-gray-500 mt-1">
          Buat ujian dan masukkan kunci jawaban.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >

        {/* Informasi ujian */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">

          <h2 className="text-lg font-semibold text-gray-800 mb-5">
            Informasi Ujian
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="sm:col-span-2">

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Judul Ujian
              </label>

              <input
                type="text"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                placeholder="Contoh: Ulangan Matematika"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-300"
              />

            </div>

            <div>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kelas
              </label>

              <input
                type="text"
                value={className}
                onChange={(e) =>
                  setClassName(e.target.value)
                }
                placeholder="Contoh: X RPL 1"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-300"
              />

            </div>

            <div>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Jumlah Soal
              </label>

              <input
                type="number"
                min="1"
                max="200"
                value={totalQuestions}
                onChange={handleTotalQuestionsChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-300"
              />

            </div>

          </div>

        </div>

        {/* Kunci jawaban */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">

          <div className="flex items-center justify-between mb-5">

            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Kunci Jawaban
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Pilih jawaban yang benar untuk setiap soal.
              </p>
            </div>

            <span className="text-sm text-gray-500">
              {totalQuestions} soal
            </span>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {answers.map((answer, index) => (

              <div
                key={index}
                className="border border-gray-200 rounded-xl p-4"
              >

                <p className="font-medium text-gray-800 mb-3">
                  Soal {index + 1}
                </p>

                <div className="grid grid-cols-4 gap-2">

                  {["A", "B", "C", "D"].map(
                    (option) => (

                      <button
                        type="button"
                        key={option}
                        onClick={() =>
                          handleAnswerChange(
                            index,
                            option
                          )
                        }
                        className={`
                          py-2 rounded-lg border font-medium transition
                          ${
                            answer === option
                              ? "bg-gray-800 text-white border-gray-800"
                              : "border-gray-300 text-gray-700 hover:bg-gray-50"
                          }
                        `}
                      >
                        {option}
                      </button>

                    )
                  )}

                </div>

              </div>

            ))}

          </div>

        </div>

        {/* Tombol */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">

          <button
            type="button"
            onClick={() => navigate("/questions")}
            className="px-5 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {loading
              ? "Menyimpan..."
              : "Simpan Soal"}
          </button>

        </div>

      </form>

    </div>
  )
}

export default createQuestion