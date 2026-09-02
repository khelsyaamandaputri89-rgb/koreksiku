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
  const [preview, setPreview] = useState(null)

  const [studentAnswers, setStudentAnswers] = useState({})
  const [correctionResult, setCorrectionResult] = useState(null)
  const [studentName, setStudentName] = useState("")

  useEffect(() => {
    fetchExams()

    return () => {
      stopCameraTracks()
    }
  }, [])

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  // =========================
  // AMBIL DATA UJIAN
  // =========================

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

  // =========================
  // AMBIL KUNCI JAWABAN
  // =========================

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

  // =========================
  // HITUNG HASIL
  // =========================

  const calculateResult = (studentAnswers, answerKeys) => {
    let correct = 0
    let wrong = 0
    let empty = 0

    const details = []

    answerKeys.forEach((key) => {
      const studentAnswer =
        studentAnswers[key.question_number] || ""

      const correctAnswer = key.answer

      let status = ""

      if (!studentAnswer) {
        empty++
        status = "empty"
      } else if (studentAnswer === correctAnswer) {
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

  // =========================
  // KAMERA
  // =========================

  const startCamera = async () => {
    try {
      setMessage("")

      if (!selectedExam) {
        setMessage("Silakan pilih ujian terlebih dahulu.")
        return
      }

      if (!studentName.trim()) {
        setMessage("Silakan masukkan nama siswa terlebih dahulu.")
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

  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop())

      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const stopCamera = () => {
    stopCameraTracks()

    setCameraOpen(false)
    setScanning(false)

    setPreview(null)
    setStudentAnswers({})
    setCorrectionResult(null)
    setMessage("")
  }

  // =========================
  // URUTKAN MARKER
  // =========================

  const orderMarkers = (markers) => {
    const sorted = [...markers].sort(
      (a, b) => (a.x + a.y) - (b.x + b.y)
    )

    const topLeft = sorted[0]
    const bottomRight = sorted[3]

    const remaining = sorted.slice(1, 3)

    let topRight = remaining[0]
    let bottomLeft = remaining[1]

    if (topRight.y > bottomLeft.y) {
      const temp = topRight
      topRight = bottomLeft
      bottomLeft = temp
    }

    return {
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
    }
  }

  // =========================
  // DETEKSI 4 MARKER
  // =========================

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
  let blur = null
  let edges = null
  let contours = null
  let hierarchy = null

  try {
    src = cv.imread(canvas)

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    blur = new cv.Mat()

    cv.GaussianBlur(
      gray,
      blur,
      new cv.Size(5, 5),
      0
    )

    edges = new cv.Mat()

    cv.Canny(
      blur,
      edges,
      50,
      150
    )

    contours = new cv.MatVector()
    hierarchy = new cv.Mat()

    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    )

    let biggestArea = 0
    let biggestCorners = null

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)

      const area = cv.contourArea(contour)

      if (area > biggestArea) {
        const perimeter =
          cv.arcLength(contour, true)

        const approx = new cv.Mat()

        cv.approxPolyDP(
          contour,
          approx,
          0.02 * perimeter,
          true
        )

        if (approx.rows === 4) {
          biggestArea = area

          const points = []

          for (let j = 0; j < 4; j++) {
            points.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1],
            })
          }

          biggestCorners = points
        }

        approx.delete()
      }

      contour.delete()
    }

    if (!biggestCorners) {
      return {
        detected: false,
        message:
          "Lembar jawaban belum terdeteksi. Pastikan seluruh kertas terlihat.",
      }
    }

    /*
      Urutkan 4 sudut kertas
    */

    const points = biggestCorners

    const topLeft =
      points.reduce((prev, curr) =>
        curr.x + curr.y <
        prev.x + prev.y
          ? curr
          : prev
      )

    const bottomRight =
      points.reduce((prev, curr) =>
        curr.x + curr.y >
        prev.x + prev.y
          ? curr
          : prev
      )

    const topRight =
      points.reduce((prev, curr) =>
        curr.x - curr.y >
        prev.x - prev.y
          ? curr
          : prev
      )

    const bottomLeft =
      points.reduce((prev, curr) =>
        curr.x - curr.y <
        prev.x - prev.y
          ? curr
          : prev
      )

    console.log(
      "SUDUT LJK:",
      {
        topLeft,
        topRight,
        bottomLeft,
        bottomRight,
      }
    )

    return {
      detected: true,
      message:
        "Lembar jawaban berhasil ditemukan! ✅",
      markers: {
        topLeft,
        topRight,
        bottomLeft,
        bottomRight,
      },
    }

  } catch (error) {
    console.error(
      "Error deteksi LJK:",
      error
    )

    return {
      detected: false,
      message:
        "Gagal mendeteksi lembar jawaban.",
    }
  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blur) blur.delete()
    if (edges) edges.delete()
    if (contours) contours.delete()
    if (hierarchy) hierarchy.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
  // =========================

  const warpAnswerSheet = (canvas, markers) => {
  const cv = window.cv

  let src = null
  let dst = null
  let srcTri = null
  let dstTri = null
  let matrix = null

  try {
    src = cv.imread(canvas)

    /*
      Ukuran hasil LJK
    */

    const width = 900
    const height = 1200

    dst = new cv.Mat()

    /*
      Urutan HARUS:

      1. kiri atas
      2. kanan atas
      3. kanan bawah
      4. kiri bawah
    */

    srcTri = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      [
        markers.topLeft.x,
        markers.topLeft.y,

        markers.topRight.x,
        markers.topRight.y,

        markers.bottomRight.x,
        markers.bottomRight.y,

        markers.bottomLeft.x,
        markers.bottomLeft.y,
      ]
    )

    dstTri = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      [
        0,
        0,

        width - 1,
        0,

        width - 1,
        height - 1,

        0,
        height - 1,
      ]
    )

    matrix = cv.getPerspectiveTransform(
      srcTri,
      dstTri
    )

    cv.warpPerspective(
      src,
      dst,
      matrix,
      new cv.Size(
        width,
        height
      ),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(
        255,
        255,
        255,
        255
      )
    )

    const resultCanvas =
      document.createElement("canvas")

    resultCanvas.width = width
    resultCanvas.height = height

    cv.imshow(
      resultCanvas,
      dst
    )

    return resultCanvas

  } catch (error) {
    console.error(
      "Error meluruskan LJK:",
      error
    )

    return null

  } finally {
    if (src) src.delete()
    if (dst) dst.delete()
    if (srcTri) srcTri.delete()
    if (dstTri) dstTri.delete()
    if (matrix) matrix.delete()
  }
}

  // =========================
  // BACA JAWABAN DINAMIS
  // =========================

  const readStudentAnswers = (
  canvas,
  totalQuestions
) => {
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
      cv.THRESH_BINARY_INV +
        cv.THRESH_OTSU
    )

    const answers = {}

    /*
      LAYOUT LJK

      Ukuran hasil warp:
      900 x 1200

      Area jawaban berada
      di bagian atas kertas.
    */

    const columns = 2

    const questionsPerColumn =
      Math.ceil(totalQuestions / columns)

    /*
      POSISI AREA JAWABAN
    */

    const startY = 245
    const endY = 470

    /*
      KOLOM KIRI DAN KANAN
    */

    const leftColumnStartX = 170
    const rightColumnStartX = 490

    /*
      JARAK ANTAR BARIS
    */

    const rowHeight =
      (endY - startY) /
      questionsPerColumn

    /*
      JARAK BUBBLE A-E
    */

    const bubbleSize = 22

    const bubbleGap = 27

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    for (
      let questionIndex = 0;
      questionIndex < totalQuestions;
      questionIndex++
    ) {
      const questionNumber =
        questionIndex + 1

      const columnIndex =
        Math.floor(
          questionIndex /
          questionsPerColumn
        )

      const rowIndex =
        questionIndex %
        questionsPerColumn

      /*
        Posisi Y setiap soal
      */

      const rowY =
        startY +
        rowIndex * rowHeight

      /*
        Tentukan kolom kiri / kanan
      */

      const columnStartX =
        columnIndex === 0
          ? leftColumnStartX
          : rightColumnStartX

      let highestInk = 0
      let secondHighestInk = 0

      let selectedAnswer = ""

      for (
        let choiceIndex = 0;
        choiceIndex < choices.length;
        choiceIndex++
      ) {
        /*
          Posisi bubble
        */

        const bubbleX =
          columnStartX +
          choiceIndex * bubbleGap

        const bubbleY =
          rowY

        /*
          Ambil bagian TENGAH bubble.

          Jangan ambil garis lingkaran,
          karena yang kita cari adalah
          tinta di dalam bubble.
        */

        const padding = 5

        const roiX =
          Math.round(
            bubbleX + padding
          )

        const roiY =
          Math.round(
            bubbleY + padding
          )

        const roiWidth =
          Math.round(
            bubbleSize -
            padding * 2
          )

        const roiHeight =
          Math.round(
            bubbleSize -
            padding * 2
          )

        /*
          Pastikan tidak keluar gambar
        */

        if (
          roiX < 0 ||
          roiY < 0 ||
          roiX + roiWidth >
            binary.cols ||
          roiY + roiHeight >
            binary.rows
        ) {
          continue
        }

        const rect =
          new cv.Rect(
            roiX,
            roiY,
            roiWidth,
            roiHeight
          )

        const roi =
          binary.roi(rect)

        const ink =
          cv.countNonZero(roi)

        roi.delete()

        console.log(
          `Soal ${questionNumber} - ${choices[choiceIndex]}:`,
          ink
        )

        if (ink > highestInk) {
          secondHighestInk =
            highestInk

          highestInk = ink

          selectedAnswer =
            choices[choiceIndex]
        } else if (
          ink > secondHighestInk
        ) {
          secondHighestInk = ink
        }
      }

      /*
        Tentukan apakah benar-benar diisi
      */

      const minimumInk = 15

      /*
        Kalau dua bubble hampir sama,
        anggap kosong supaya tidak salah
        memilih jawaban.
      */

      const isAmbiguous =
        secondHighestInk >
        highestInk * 0.75

      if (
        highestInk < minimumInk ||
        isAmbiguous
      ) {
        answers[questionNumber] = ""
      } else {
        answers[questionNumber] =
          selectedAnswer
      }
    }

    console.log(
      "HASIL JAWABAN:",
      answers
    )

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
  
  const saveCorrectionResult = async (result, answers, answerKeys) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error("User belum login")
      return false
    }

    // Simpan hasil koreksi utama
    const { data: correctionData, error: correctionError } = await supabase
      .from("correction_results")
      .insert([
        {
          user_id: user.id,
          question_id: selectedExam,
          student_name: studentName.trim(),
          total_questions: result.total,
          correct_answers: result.correct,
          wrong_answers: result.wrong,
          score: result.score,
        },
      ])
      .select()
      .single()

    if (correctionError) {
      console.error("Error menyimpan hasil koreksi:", correctionError)
      return false
    }

    // Siapkan jawaban siswa per nomor
    const studentAnswersData = answerKeys.map((key) => ({
      correction_result_id: correctionData.id,
      question_number: key.question_number,
      answer: answers[key.question_number] || "",
      is_correct:
        answers[key.question_number] === key.answer,
    }))

    // Simpan jawaban siswa
    const { error: answersError } = await supabase
      .from("student_answers")
      .insert(studentAnswersData)

    if (answersError) {
      console.error("Error menyimpan jawaban siswa:", answersError)
      return false
    }

    return true
  }

  const handleScan = async () => {
    if (!videoRef.current) return

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      // Ambil kunci jawaban terlebih dahulu
      const answerKeys = await getAnswerKey()

      if (answerKeys.length === 0) {
        setMessage(
          "Kunci jawaban untuk ujian ini belum tersedia."
        )

        setScanning(false)
        return
      }

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

      // Ambil foto dari kamera
      const canvas =
        document.createElement("canvas")

      canvas.width =
        video.videoWidth

      canvas.height =
        video.videoHeight

      const context =
        canvas.getContext("2d")

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      )

      setMessage(
        "Mendeteksi marker LJK..."
      )

      // Deteksi marker
      const detection =
        detectAnswerSheet(canvas)

      console.log(
        "Hasil deteksi:",
        detection
      )

      if (!detection.detected) {
        setMessage(detection.message)

        const imageUrl =
          canvas.toDataURL(
            "image/jpeg",
            0.9
          )

        setPreview(imageUrl)

        setScanning(false)
        return
      }

      setMessage(
        "Meluruskan lembar jawaban..."
      )

      // Luruskan LJK
      const correctedCanvas =
        warpAnswerSheet(
          canvas,
          detection.markers
        )

      // Tampilkan hasil LJK yang sudah lurus
      const imageUrl =
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )

      setPreview(imageUrl)

      setMessage(
        "Membaca jawaban siswa..."
      )

      // Baca jawaban sesuai jumlah soal
      const detectedAnswers =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "Jawaban siswa:",
        detectedAnswers
      )

      setStudentAnswers(
        detectedAnswers
      )

      // Hitung hasil
      const resultCorrection = calculateResult(
        detectedAnswers,
        answerKeys
      )

      setCorrectionResult(resultCorrection)

      const saved = await saveCorrectionResult(
        resultCorrection,
        detectedAnswers,
        answerKeys
      )

      if (saved) {
        setMessage("Koreksi selesai dan hasil berhasil disimpan! 🎉")
      } else {
        setMessage("Koreksi selesai, tetapi hasil gagal disimpan.")
      }

      setMessage(
        "Koreksi selesai! 🎉"
      )

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
            onChange={(e) => {
              setSelectedExam(e.target.value)
              setCorrectionResult(null)
              setStudentAnswers({})
              setMessage("")
            }}
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

          <div className="mt-5">
            <label className="mb-2 block font-semibold text-slate-700">
              Nama Siswa
            </label>

            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Masukkan nama siswa"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-slate-500"
            />
          </div>

        </div>

        {/* SCANNER */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <h2 className="text-xl font-bold text-slate-800">
            Scan Lembar Jawaban
          </h2>

          <p className="mt-1 text-gray-500">
            Pastikan seluruh LJK dan 4 marker hitam terlihat.
          </p>

          <div className="relative mt-5 overflow-hidden rounded-2xl bg-black">

            {cameraOpen ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block min-h-[400px] w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">

                  <div className="relative h-[85%] w-[80%] rounded-xl border-2 border-white">

                    <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-green-400" />

                    <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-green-400" />

                    <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-green-400" />

                    <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-green-400" />

                  </div>

                </div>

                <div className="absolute left-0 right-0 top-4 text-center">

                  <span className="rounded-full bg-black/60 px-4 py-2 text-sm text-white">
                    Pastikan 4 marker hitam terlihat
                  </span>

                </div>

              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">

                <div className="text-6xl">
                  📷
                </div>

                <h3 className="mt-4 text-xl font-bold text-white">
                  Scanner Lembar Jawaban
                </h3>

                <p className="mt-2 max-w-md text-gray-300">
                  Kamera akan digunakan untuk memindai
                  lembar jawaban siswa.
                </p>

                <button
                  onClick={startCamera}
                  disabled={!selectedExam || !studentName.trim()}
                  className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📷 Buka Scanner
                </button>

              </div>
            )}

          </div>

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

          {message && (
            <div className="mt-5 rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>
          )}

          {/* HASIL KOREKSI */}

          {correctionResult && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">

              <h2 className="text-2xl font-bold text-slate-800">
                🎉 Hasil Koreksi
              </h2>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">

                <p className="mt-2 text-gray-500">
                  Nama Siswa:{" "}
                  <span className="font-semibold text-slate-800">
                    {studentName}
                  </span>
                </p>

                <div className="rounded-xl bg-blue-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Nilai
                  </p>

                  <p className="mt-2 text-4xl font-bold text-blue-600">
                    {correctionResult.score}
                  </p>
                </div>

                <div className="rounded-xl bg-green-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Benar
                  </p>

                  <p className="mt-2 text-4xl font-bold text-green-600">
                    {correctionResult.correct}
                  </p>
                </div>

                <div className="rounded-xl bg-red-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Salah
                  </p>

                  <p className="mt-2 text-4xl font-bold text-red-600">
                    {correctionResult.wrong}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-100 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Kosong
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-700">
                    {correctionResult.empty}
                  </p>
                </div>

              </div>

              <div className="mt-6 overflow-x-auto">

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
          )}

          {/* PREVIEW */}

          {preview && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">

              <h3 className="mb-3 font-bold text-slate-800">
                Hasil Scan yang Sudah Diluruskan
              </h3>

              <div className="overflow-hidden rounded-xl bg-gray-100">
                <img
                  src={preview}
                  alt="Hasil scan"
                  className="max-h-[700px] w-full object-contain"
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