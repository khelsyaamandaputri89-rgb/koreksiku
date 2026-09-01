import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

function AnswerSheet() {
  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState("")
  const [answerKeys, setAnswerKeys] = useState([])

  useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setExams(data || [])
  }

  const handleExamChange = async (examId) => {
    setSelectedExam(examId)

    if (!examId) {
      setAnswerKeys([])
      return
    }

    const { data, error } = await supabase
      .from("answer_keys")
      .select("*")
      .eq("question_id", examId)
      .order("question_number", { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    setAnswerKeys(data || [])
  }

  const handlePrint = () => {
    window.print()
  }

  // Membagi soal menjadi 2 kolom
  // Contoh 10 soal:
  // Kolom kiri: 1 - 5
  // Kolom kanan: 6 - 10
  const middle = Math.ceil(answerKeys.length / 2)

  const leftColumn = answerKeys.slice(0, middle)
  const rightColumn = answerKeys.slice(middle)

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      {/* BAGIAN TIDAK IKUT DIPRINT */}
      <div className="mx-auto mb-6 max-w-4xl print:hidden">

        <h1 className="text-2xl font-bold text-slate-800">
          Cetak Lembar Jawaban
        </h1>

        <p className="mt-2 text-gray-500">
          Pilih ujian untuk membuat template LJK.
        </p>

        <div className="mt-5 flex gap-3">

          <select
            value={selectedExam}
            onChange={(e) => handleExamChange(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3"
          >
            <option value="">
              -- Pilih Ujian --
            </option>

            {exams.map((exam) => (
              <option
                key={exam.id}
                value={exam.id}
              >
                {exam.title || exam.name || "Ujian"}
              </option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            disabled={!selectedExam}
            className="rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            🖨️ Cetak LJK
          </button>

        </div>
      </div>


      {/* LEMBAR JAWABAN */}
      {selectedExam && (

        <div className="answer-sheet mx-auto w-full max-w-4xl bg-white p-10 shadow print:max-w-none print:shadow-none">


          {/* MARKER ATAS */}
          <div className="flex justify-between">

            <div className="h-8 w-8 bg-black" />

            <div className="h-8 w-8 bg-black" />

          </div>


          {/* HEADER */}
          <div className="mt-6 text-center">

            <h1 className="text-2xl font-bold">
              LEMBAR JAWABAN
            </h1>

            <p className="mt-2">
              Pilih satu jawaban yang paling benar.
            </p>

          </div>


          {/* DATA SISWA */}
          <div className="mt-8 grid grid-cols-2 gap-6">

            <div>
              <p>
                Nama:
                <span className="ml-2 inline-block w-56 border-b border-black" />
              </p>
            </div>

            <div>
              <p>
                Kelas:
                <span className="ml-2 inline-block w-40 border-b border-black" />
              </p>
            </div>

          </div>


          {/* JAWABAN */}
          <div className="mt-10 mx-auto grid w-fit grid-cols-2 gap-x-20">

            {/* KOLOM KIRI */}
            <div className="space-y-3">

              {leftColumn.map((item) => (

                <div
                  key={item.question_number}
                  className="flex items-center gap-3 whitespace-nowrap"
                >

                  <span className="w-8 font-semibold">
                    {item.question_number}.
                  </span>


                  {["A", "B", "C", "D", "E"].map((choice) => (

                    <div
                      key={choice}
                      className="flex items-center gap-1"
                    >

                      <div className="h-5 w-5 rounded-full border-2 border-black" />

                      <span className="text-sm">
                        {choice}
                      </span>

                    </div>

                  ))}

                </div>

              ))}

            </div>


            {/* KOLOM KANAN */}
            <div className="space-y-3">

              {rightColumn.map((item) => (

                <div
                  key={item.question_number}
                  className="flex items-center gap-3"
                >

                  <span className="w-8 font-semibold">
                    {item.question_number}.
                  </span>


                  {["A", "B", "C", "D", "E"].map((choice) => (

                    <div
                      key={choice}
                      className="flex items-center gap-1"
                    >

                      <div className="h-5 w-5 rounded-full border-2 border-black" />

                      <span className="text-sm">
                        {choice}
                      </span>

                    </div>

                  ))}

                </div>

              ))}

            </div>

          </div>


          {/* MARKER BAWAH */}
          <div className="mt-10 flex justify-between">

            <div className="h-8 w-8 bg-black" />

            <div className="h-8 w-8 bg-black" />

          </div>

        </div>

      )}

    </div>
  )
}

export default AnswerSheet