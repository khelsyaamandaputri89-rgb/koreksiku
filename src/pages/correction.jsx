import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"

function correction() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState("")
  const [scanResult, setScanResult] = useState(null)
  const [preview, setPreview] = useState(null)

  const [studentAnswers, setStudentAnswers] = useState({})
  const [correctionResult, setCorrectionResult] = useState(null)

  useEffect(() => {
    fetchExams()

    return () => {
      stopCamera()
    }
  }, [])

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error mengambil ujian:", error)
      return
    }

    setExams(data || [])
  }

    const getAnswerKey = async () => {
      const { data, error } = await supabase
        .from("answer_keys")
        .select("*")
        .eq("question_id", selectedExam)
        .order("question_number", { ascending: true })

      if (error) {
        console.error("Error mengambil kunci jawaban:", error)
        return []
      }

      return data || []
    }

    const calculateResult = (
      studentAnswers,
      answerKeys
    ) => {
      let correct = 0
      let wrong = 0
      let empty = 0

      const details = []

      answerKeys.forEach((key) => {
        const studentAnswer =
          studentAnswers[key.question_number] || ""

        const correctAnswer =
          key.answer

        let status = ""

        if (!studentAnswer) {
          empty++
          status = "empty"
        } else if (
          studentAnswer === correctAnswer
        ) {
          correct++
          status = "correct"
        } else {
          wrong++
          status = "wrong"
        }

        details.push({
          number: key.question_number,
          studentAnswer,
          correctAnswer,
          status,
        })
      })

      const total = answerKeys.length

      const score =
        total > 0
          ? Math.round((correct / total) * 100)
          : 0

      return {
        correct,
        wrong,
        empty,
        total,
        score,
        details,
      }
    }

  const startCamera = async () => {
    try {
      setMessage("")

      if (!selectedExam) {
        setMessage("Silakan pilih ujian terlebih dahulu.")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment",
          },
          width: {
            ideal: 1920,
          },
          height: {
            ideal: 1080,
          },
        },
        audio: false,
      })

      streamRef.current = stream

      setCameraOpen(true)

    } catch (error) {
      console.error("Kamera error:", error)

      setMessage(
        "Kamera tidak dapat digunakan. Pastikan izin kamera sudah diberikan."
      )
    }
  }

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject
        .getTracks()
        .forEach((track) => track.stop())

      videoRef.current.srcObject = null
    }

    setCameraOpen(false)
    setScanning(false)

    // Reset hasil scan
    setScanResult(null)
    setPreview(null)
    setStudentAnswers({})
    setCorrectionResult(null)

    // Reset pesan
    setMessage("")
  }

  const readStudentAnswers = (canvas) => {
      if (!window.cv || !window.cv.Mat) {
        return {}
      }

      const cv = window.cv

      let src = null
      let gray = null
      let binary = null

      try {
        src = cv.imread(canvas)

        gray = new cv.Mat()

        cv.cvtColor(
          src,
          gray,
          cv.COLOR_RGBA2GRAY
        )

        binary = new cv.Mat()

        cv.threshold(
          gray,
          binary,
          0,
          255,
          cv.THRESH_BINARY_INV + cv.THRESH_OTSU
        )

        const answers = {}

        /*
          SEMENTARA:
          Koordinat ini berdasarkan foto LJK kamu.

          Nanti akan kita rapikan supaya
          bisa bekerja lebih stabil.
        */

        const columns = [
          {
            startQuestion: 1,
            x: 55,
            y: 510,
            width: 125,
            height: 350,
          },

          {
            startQuestion: 11,
            x: 215,
            y: 510,
            width: 125,
            height: 350,
          },

          {
            startQuestion: 21,
            x: 375,
            y: 510,
            width: 125,
            height: 350,
          },

          {
            startQuestion: 31,
            x: 535,
            y: 510,
            width: 125,
            height: 350,
          },

          {
            startQuestion: 41,
            x: 690,
            y: 510,
            width: 125,
            height: 350,
          },
        ]

        const choices = ["A", "B", "C", "D", "E"]

        columns.forEach((column) => {

          const questionHeight =
            column.height / 10

          for (let i = 0; i < 10; i++) {

            const questionNumber =
              column.startQuestion + i

            const y =
              column.y + (i * questionHeight)

            let highestInk = 0
            let selectedAnswer = ""

            for (let choiceIndex = 0; choiceIndex < 5; choiceIndex++) {

              const choiceWidth =
                column.width / 5

              const x =
                column.x +
                (choiceIndex * choiceWidth)

              const rect =
                new cv.Rect(
                  Math.round(x),
                  Math.round(y),
                  Math.round(choiceWidth),
                  Math.round(questionHeight)
                )

              const roi =
                binary.roi(rect)

              const ink =
                cv.countNonZero(roi)

              roi.delete()

              if (ink > highestInk) {
                highestInk = ink
                selectedAnswer =
                  choices[choiceIndex]
              }
            }

            /*
              Threshold sementara.

              Kalau tinta terlalu sedikit,
              dianggap kosong.
            */

            if (highestInk > 150) {
              answers[questionNumber] =
                selectedAnswer
            } else {
              answers[questionNumber] = ""
            }
          }

        })

        return answers

      } catch (error) {
        console.error(
          "Error membaca jawaban:",
          error
        )

        return {}

      } finally {
        if (src) src.delete()
        if (gray) gray.delete()
        if (binary) binary.delete()
      }
    }

  const detectAnswerSheet = (canvas) => {
    if (!window.cv || !window.cv.Mat) {
      return {
        detected: false,
        message: "OpenCV belum siap.",
      }
    }

    const cv = window.cv

    let src = null
    let gray = null
    let binary = null
    let contours = null
    let hierarchy = null

    try {
      src = cv.imread(canvas)

      gray = new cv.Mat()

      // Ubah gambar menjadi grayscale
      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      binary = new cv.Mat()

      // Cari area hitam
      cv.threshold(
        gray,
        binary,
        80,
        255,
        cv.THRESH_BINARY_INV
      )

      contours = new cv.MatVector()
      hierarchy = new cv.Mat()

      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )

      const imageArea =
        canvas.width * canvas.height

      const markers = []

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)

        const area = cv.contourArea(contour)

        // Marker tidak boleh terlalu kecil
        if (area < imageArea * 0.0001) {
          contour.delete()
          continue
        }

        const rect = cv.boundingRect(contour)

        const aspectRatio =
          rect.width / rect.height

        /*
          Marker berbentuk kotak.
          Jadi rasio width dan height
          harus mendekati 1.
        */
        const isSquare =
          aspectRatio > 0.7 &&
          aspectRatio < 1.3

        if (isSquare) {
          markers.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            area,
          })
        }

        contour.delete()
      }

      console.log("Marker ditemukan:", markers)

      // Harus ada minimal 4 marker
      if (markers.length < 4) {
        return {
          detected: false,
          message:
            `Marker tidak lengkap. Ditemukan ${markers.length} marker.`,
        }
      }

      /*
        Urutkan marker berdasarkan posisi.
      */

      markers.sort((a, b) => a.y - b.y)

      const topMarkers =
        markers.slice(0, 2).sort((a, b) => a.x - b.x)

      const bottomMarkers =
        markers
          .slice(-2)
          .sort((a, b) => a.x - b.x)

      const orderedMarkers = {
        topLeft: topMarkers[0],
        topRight: topMarkers[1],
        bottomLeft: bottomMarkers[0],
        bottomRight: bottomMarkers[1],
      }

      console.log(
        "Marker terurut:",
        orderedMarkers
      )

      return {
        detected: true,
        message:
          "LJK berhasil terdeteksi! ✅",
        markers: orderedMarkers,
      }

    } catch (error) {
      console.error(
        "Error deteksi marker:",
        error
      )

      return {
        detected: false,
        message:
          "Gagal mendeteksi marker.",
      }

    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (binary) binary.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  const handleScan = async () => {
    if (!videoRef.current) return

    setScanning(true)
    setMessage("")
    setScanResult(null)
    setPreview(null)
    setCorrectionResult(null)

    try {
      const video = videoRef.current

      if (
        !video.videoWidth ||
        !video.videoHeight
      ) {
        setMessage(
          "Kamera belum siap. Tunggu beberapa detik lalu coba lagi."
        )

        setScanning(false)
        return
      }

      const canvas =
        document.createElement("canvas")

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context =
        canvas.getContext("2d")

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      )

      // Buat preview gambar
      const imageUrl =
        canvas.toDataURL(
          "image/jpeg",
          0.9
        )

      setPreview(imageUrl)

      // Deteksi LJK
      const result =
        detectAnswerSheet(canvas)

      console.log(
        "Hasil deteksi:",
        result
      )

      setScanResult(result)

      if (result.detected) {
        setMessage("Lembar jawaban terdeteksi! Membaca jawaban...")

        // SIMULASI JAWABAN SISWA SEMENTARA
        const detectedAnswers =
          readStudentAnswers(canvas)

        console.log(
          "Jawaban siswa:",
          detectedAnswers
        )

        setStudentAnswers(detectedAnswers)

        // Ambil kunci jawaban dari Supabase
        const answerKeys = await getAnswerKey()

        if (answerKeys.length === 0) {
          setMessage("Kunci jawaban untuk ujian ini belum tersedia.")
          setScanning(false)
          return
        }

        // Hitung hasil koreksi
        const resultCorrection = calculateResult(
          detectedAnswers,
          answerKeys
        )

        setCorrectionResult(resultCorrection)

        setMessage("Koreksi selesai! 🎉")
      } else {
        setMessage(result.message)
      }

    } catch (error) {
      console.error(
        "Scan error:",
        error
      )

      setMessage(
        "Terjadi kesalahan saat memindai."
      )
    }

    setScanning(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">

      <div className="mx-auto max-w-5xl">

        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">
            Koreksi Lembar Jawaban
          </h1>

          <p className="mt-2 text-gray-500">
            Pilih ujian kemudian scan lembar jawaban siswa.
          </p>
        </div>

        {/* PILIH UJIAN */}
        <div className="rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <label className="mb-2 block font-semibold text-slate-700">
            Pilih Ujian
          </label>

          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-slate-500"
          >
            <option value="">
              -- Pilih ujian --
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

        </div>

        {/* SCANNER */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <h2 className="text-xl font-bold text-slate-800">
            Scan Lembar Jawaban
          </h2>

          <p className="mt-1 text-gray-500">
            Arahkan kamera ke seluruh lembar jawaban.
          </p>

          {/* CAMERA */}
          <div className="relative mt-5 overflow-hidden rounded-2xl bg-black">

            {cameraOpen ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block h-auto min-h-[400px] w-full object-cover"
                />

                {/* FRAME SCANNER */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">

                  <div className="relative h-[85%] w-[80%] rounded-xl border-2 border-white">

                    {/* CORNER */}
                    <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-green-400" />

                    <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-green-400" />

                    <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-green-400" />

                    <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-green-400" />

                  </div>

                </div>

                {/* PETUNJUK */}
                <div className="absolute left-0 right-0 top-4 text-center">

                  <span className="rounded-full bg-black/60 px-4 py-2 text-sm text-white">
                    Letakkan seluruh LJK di dalam kotak
                  </span>

                </div>

              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">

                <div className="text-6xl">
                  📷
                </div>

                <h3 className="mt-4 text-xl font-bold text-slate-800">
                  Scanner Lembar Jawaban
                </h3>

                <p className="mt-2 max-w-md text-gray-500">
                  Kamera akan digunakan untuk memindai
                  lembar jawaban siswa.
                </p>

                <button
                  onClick={startCamera}
                  disabled={!selectedExam}
                  className="mt-6 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📷 Buka Scanner
                </button>

              </div>
            )}

          </div>

          {/* BUTTON SCAN */}
          {cameraOpen && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={stopCamera}
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex-1 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {scanning
                  ? "⏳ Memindai..."
                  : "🔍 Scan Lembar Jawaban"}
              </button>

            </div>
          )}

          {/* MESSAGE */}
          {message && (
            <div className="mt-5 rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>
          )}

          {correctionResult && (
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

              <h2 className="text-2xl font-bold text-slate-800">
                🎉 Hasil Koreksi
              </h2>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">

                {/* NILAI */}
                <div className="rounded-xl bg-blue-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Nilai
                  </p>

                  <p className="mt-2 text-4xl font-bold text-blue-600">
                    {correctionResult.score}
                  </p>
                </div>

                {/* BENAR */}
                <div className="rounded-xl bg-green-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Benar
                  </p>

                  <p className="mt-2 text-4xl font-bold text-green-600">
                    {correctionResult.correct}
                  </p>
                </div>

                {/* SALAH */}
                <div className="rounded-xl bg-red-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Salah
                  </p>

                  <p className="mt-2 text-4xl font-bold text-red-600">
                    {correctionResult.wrong}
                  </p>
                </div>

                {/* KOSONG */}
                <div className="rounded-xl bg-gray-100 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Kosong
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-700">
                    {correctionResult.empty}
                  </p>
                </div>

              </div>

              {/* DETAIL JAWABAN */}
              <div className="mt-6">

                <h3 className="mb-3 text-lg font-bold text-slate-800">
                  Detail Jawaban
                </h3>

                <div className="overflow-x-auto">

                  <table className="w-full border-collapse">

                    <thead>
                      <tr className="border-b bg-gray-50 text-left">
                        <th className="p-3">No</th>
                        <th className="p-3">Jawaban Siswa</th>
                        <th className="p-3">Kunci Jawaban</th>
                        <th className="p-3">Hasil</th>
                      </tr>
                    </thead>

                    <tbody>
                      {correctionResult.details.map((item) => (
                        <tr
                          key={item.number}
                          className="border-b"
                        >
                          <td className="p-3">
                            {item.number}
                          </td>

                          <td className="p-3">
                            {item.studentAnswer || "-"}
                          </td>

                          <td className="p-3">
                            {item.correctAnswer}
                          </td>

                          <td className="p-3">
                            {item.status === "correct" && "✅ Benar"}
                            {item.status === "wrong" && "❌ Salah"}
                            {item.status === "empty" && "⬜ Kosong"}
                          </td>

                        </tr>
                      ))}
                    </tbody>

                  </table>

                </div>

              </div>

            </div>
          )}

          {preview && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">

              <h3 className="mb-3 font-bold text-slate-800">
                Hasil Scan
              </h3>

              <div className="overflow-hidden rounded-xl bg-gray-100">
                <img
                  src={preview}
                  alt="Hasil scan"
                  className="max-h-[600px] w-full object-contain"
                />
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  )
}

export default correction