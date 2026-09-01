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

  const [scanResult, setScanResult] = useState(null)
  const [correctionResult, setCorrectionResult] = useState(null)

  useEffect(() => {
    fetchExams()

    return () => {
      stopCameraTracks()
    }
  }, [])

  useEffect(() => {
    if (
      cameraOpen &&
      videoRef.current &&
      streamRef.current
    ) {
      videoRef.current.srcObject =
        streamRef.current
    }
  }, [cameraOpen])

  // =========================
  // AMBIL DATA UJIAN
  // =========================

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", {
        ascending: false,
      })

    if (error) {
      console.error(error)
      return
    }

    setExams(data || [])
  }

  // =========================
  // AMBIL KUNCI JAWABAN
  // =========================

  const getAnswerKeys = async () => {
    if (!selectedExam) return []

    const { data, error } = await supabase
      .from("answer_keys")
      .select("*")
      .eq("question_id", selectedExam)
      .order("question_number", {
        ascending: true,
      })

    if (error) {
      console.error(
        "Error mengambil kunci jawaban:",
        error
      )

      return []
    }

    return data || []
  }

  // =========================
  // CAMERA
  // =========================

  const startCamera = async () => {
    try {
      setMessage("")
      setPreview(null)
      setCorrectionResult(null)

      if (!selectedExam) {
        setMessage(
          "Silakan pilih ujian terlebih dahulu."
        )
        return
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
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
      console.error(
        "Kamera error:",
        error
      )

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
  }

  // =========================
  // DETEKSI 4 MARKER
  // =========================

  const detectMarkers = (canvas) => {
    if (!window.cv) {
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

      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      cv.GaussianBlur(
        gray,
        gray,
        new cv.Size(5, 5),
        0
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

      const candidates = []

      for (
        let i = 0;
        i < contours.size();
        i++
      ) {
        const contour =
          contours.get(i)

        const area =
          cv.contourArea(contour)

        const rect =
          cv.boundingRect(contour)

        contour.delete()

        // Marker terlalu kecil
        if (
          area <
          imageArea * 0.00003
        ) {
          continue
        }

        const ratio =
          rect.width / rect.height

        // Harus mendekati persegi
        if (
          ratio < 0.6 ||
          ratio > 1.5
        ) {
          continue
        }

        candidates.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          area,
          centerX:
            rect.x + rect.width / 2,
          centerY:
            rect.y + rect.height / 2,
        })
      }

      console.log(
        "Candidate marker:",
        candidates
      )

      if (candidates.length < 4) {
        return {
          detected: false,
          message: `Marker tidak lengkap. Ditemukan ${candidates.length} kandidat.`,
        }
      }

      /*
        Bagi gambar menjadi 4 area.

        Marker harus berada
        di dekat sudut LJK.
      */

      const width = canvas.width
      const height = canvas.height

      const cornerLimitX =
        width * 0.35

      const cornerLimitY =
        height * 0.35

      const topLeft =
        candidates
          .filter(
            (m) =>
              m.centerX <
                cornerLimitX &&
              m.centerY <
                cornerLimitY
          )
          .sort(
            (a, b) =>
              a.centerX +
              a.centerY -
              (b.centerX +
                b.centerY)
          )[0]

      const topRight =
        candidates
          .filter(
            (m) =>
              m.centerX >
                width - cornerLimitX &&
              m.centerY <
                cornerLimitY
          )
          .sort(
            (a, b) =>
              b.centerX -
              b.centerX +
              (a.centerY -
                b.centerY)
          )[0]

      const bottomLeft =
        candidates
          .filter(
            (m) =>
              m.centerX <
                cornerLimitX &&
              m.centerY >
                height - cornerLimitY
          )
          .sort(
            (a, b) =>
              b.centerY -
              a.centerY
          )[0]

      const bottomRight =
        candidates
          .filter(
            (m) =>
              m.centerX >
                width - cornerLimitX &&
              m.centerY >
                height - cornerLimitY
          )
          .sort(
            (a, b) =>
              b.centerX +
              b.centerY -
              (a.centerX +
                a.centerY)
          )[0]

      console.log(
        "Marker sudut:",
        {
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
        }
      )

      if (
        !topLeft ||
        !topRight ||
        !bottomLeft ||
        !bottomRight
      ) {
        return {
          detected: false,
          message:
            "4 marker sudut LJK belum ditemukan dengan benar.",
        }
      }

      /*
        Validasi ukuran marker.

        Jangan sampai marker
        yang satu sangat besar
        dibanding lainnya.
      */

      const markerAreas = [
        topLeft.area,
        topRight.area,
        bottomLeft.area,
        bottomRight.area,
      ]

      const minArea =
        Math.min(...markerAreas)

      const maxArea =
        Math.max(...markerAreas)

      if (maxArea > minArea * 8) {
        return {
          detected: false,
          message:
            "Marker yang ditemukan tidak konsisten. Pastikan seluruh LJK terlihat.",
        }
      }

      return {
        detected: true,
        markers: {
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
        },
        message:
          "4 marker LJK berhasil ditemukan.",
      }

    } catch (error) {
      console.error(
        "Error marker:",
        error
      )

      return {
        detected: false,
        message:
          "Terjadi kesalahan saat mendeteksi marker.",
      }

    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (binary) binary.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  // =========================
  // LURUSKAN LJK
  // =========================

  const warpAnswerSheet = (
    canvas,
    markers
  ) => {
    const cv = window.cv

    let src = null
    let dst = null
    let srcTri = null
    let dstTri = null
    let matrix = null

    try {
      src = cv.imread(canvas)

      /*
        Ukuran standar LJK.

        Semua foto nanti diubah
        ke ukuran yang sama.
      */

      const outputWidth = 1200
      const outputHeight = 1600

      dst = new cv.Mat()

      srcTri = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [
          markers.topLeft.centerX,
          markers.topLeft.centerY,

          markers.topRight.centerX,
          markers.topRight.centerY,

          markers.bottomLeft.centerX,
          markers.bottomLeft.centerY,

          markers.bottomRight.centerX,
          markers.bottomRight.centerY,
        ]
      )

      dstTri = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [
          0,
          0,

          outputWidth,
          0,

          0,
          outputHeight,

          outputWidth,
          outputHeight,
        ]
      )

      matrix =
        cv.getPerspectiveTransform(
          srcTri,
          dstTri
        )

      cv.warpPerspective(
        src,
        dst,
        matrix,
        new cv.Size(
          outputWidth,
          outputHeight
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

      resultCanvas.width =
        outputWidth

      resultCanvas.height =
        outputHeight

      cv.imshow(
        resultCanvas,
        dst
      )

      return resultCanvas

    } catch (error) {
      console.error(
        "Warp error:",
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
  // BACA JAWABAN
  // =========================

  const readStudentAnswers = (
    canvas,
    totalQuestions
  ) => {
    if (!window.cv) {
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
        Layout mengikuti template LJK.

        Untuk:
        <= 20 soal = 2 kolom
        <= 40 soal = 3 kolom
        > 40 soal = 4 kolom
      */

      let columnCount = 2

      if (totalQuestions > 20) {
        columnCount = 3
      }

      if (totalQuestions > 40) {
        columnCount = 4
      }

      const rows =
        Math.ceil(
          totalQuestions /
            columnCount
        )

      /*
        AREA JAWABAN

        Kalau nanti posisi LJK
        berubah sedikit, bagian ini
        yang kita sesuaikan.
      */

      const startX =
        canvas.width * 0.08

      const endX =
        canvas.width * 0.92

      const startY =
        canvas.height * 0.34

      const endY =
        canvas.height * 0.82

      const columnWidth =
        (endX - startX) /
        columnCount

      const rowHeight =
        (endY - startY) / rows

      const choices = [
        "A",
        "B",
        "C",
        "D",
        "E",
      ]

      for (
        let questionIndex = 0;
        questionIndex <
        totalQuestions;
        questionIndex++
      ) {
        /*
          Nomor soal dibuat
          urut ke bawah dulu.

          Contoh 15 soal:

          Kolom kiri:
          1 - 8

          Kolom kanan:
          9 - 15
        */

        const column =
          Math.floor(
            questionIndex / rows
          )

        const row =
          questionIndex % rows

        const x =
          startX +
          column * columnWidth

        const y =
          startY +
          row * rowHeight

        /*
          Area pilihan A-E.

          Nomor soal ada di kiri,
          lalu bubble berada setelahnya.
        */

        const bubbleStartX =
          x +
          columnWidth * 0.22

        const bubbleAreaWidth =
          columnWidth * 0.72

        let highestInk = 0
        let secondHighestInk = 0

        let selectedAnswer = ""

        choices.forEach(
          (choice, index) => {
            const bubbleX =
              bubbleStartX +
              (index *
                bubbleAreaWidth) /
                5

            const bubbleY =
              y +
              rowHeight * 0.15

            const bubbleWidth =
              bubbleAreaWidth / 5

            const bubbleHeight =
              rowHeight * 0.7

            const paddingX =
              bubbleWidth * 0.25

            const paddingY =
              bubbleHeight * 0.2

            const roiX =
              Math.round(
                bubbleX + paddingX
              )

            const roiY =
              Math.round(
                bubbleY + paddingY
              )

            const roiWidth =
              Math.round(
                bubbleWidth -
                  paddingX * 2
              )

            const roiHeight =
              Math.round(
                bubbleHeight -
                  paddingY * 2
              )

            /*
              Pastikan ROI
              tidak keluar gambar.
            */

            if (
              roiX < 0 ||
              roiY < 0 ||
              roiX + roiWidth >
                binary.cols ||
              roiY + roiHeight >
                binary.rows
            ) {
              return
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

            if (
              ink > highestInk
            ) {
              secondHighestInk =
                highestInk

              highestInk = ink

              selectedAnswer =
                choice
            } else if (
              ink > secondHighestInk
            ) {
              secondHighestInk = ink
            }
          }
        )

        /*
          Jika tinta terlalu sedikit,
          dianggap kosong.
        */

        const minimumInk = 30

        /*
          Jika dua pilihan hampir sama,
          jangan asal memilih jawaban.
        */

        const isAmbiguous =
          secondHighestInk >
          highestInk * 0.75

        if (
          highestInk < minimumInk ||
          isAmbiguous
        ) {
          answers[
            questionIndex + 1
          ] = ""
        } else {
          answers[
            questionIndex + 1
          ] = selectedAnswer
        }
      }

      console.log(
        "Jawaban terbaca:",
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

  // =========================
  // HITUNG NILAI
  // =========================

  const calculateResult = (
    studentAnswers,
    answerKeys
  ) => {
    let correct = 0
    let wrong = 0
    let empty = 0

    const details = []

    answerKeys.forEach((key) => {
      const number =
        key.question_number

      const studentAnswer =
        studentAnswers[number] || ""

      const correctAnswer =
        key.answer

      let status = ""

      if (!studentAnswer) {
        empty++
        status = "empty"

      } else if (
        studentAnswer ===
        correctAnswer
      ) {
        correct++
        status = "correct"

      } else {
        wrong++
        status = "wrong"
      }

      details.push({
        number,
        studentAnswer,
        correctAnswer,
        status,
      })
    })

    const total =
      answerKeys.length

    const score =
      total > 0
        ? Math.round(
            (correct / total) * 100
          )
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
  // SCAN
  // =========================

  const handleScan = async () => {
    if (!videoRef.current) return

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      const video =
        videoRef.current

      if (
        !video.videoWidth ||
        !video.videoHeight
      ) {
        setMessage(
          "Kamera belum siap."
        )

        setScanning(false)
        return
      }

      const originalCanvas =
        document.createElement(
          "canvas"
        )

      originalCanvas.width =
        video.videoWidth

      originalCanvas.height =
        video.videoHeight

      const context =
        originalCanvas.getContext(
          "2d"
        )

      context.drawImage(
        video,
        0,
        0,
        originalCanvas.width,
        originalCanvas.height
      )

      setMessage(
        "Mencari marker LJK..."
      )

      // 1. DETEKSI MARKER

      const markerResult =
        detectMarkers(
          originalCanvas
        )

      console.log(
        "Hasil marker:",
        markerResult
      )

      setScanResult(markerResult)

      if (!markerResult.detected) {
        setMessage(
          markerResult.message
        )

        setScanning(false)
        return
      }

      // 2. LURUSKAN LJK

      setMessage(
        "Meluruskan LJK..."
      )

      const correctedCanvas =
        warpAnswerSheet(
          originalCanvas,
          markerResult.markers
        )

      if (!correctedCanvas) {
        setMessage(
          "Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      // Tampilkan hasil LJK
      const correctedImage =
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )

      setPreview(
        correctedImage
      )

      // 3. AMBIL KUNCI JAWABAN

      setMessage(
        "Mengambil kunci jawaban..."
      )

      const answerKeys =
        await getAnswerKeys()

      if (
        answerKeys.length === 0
      ) {
        setMessage(
          "Kunci jawaban belum tersedia."
        )

        setScanning(false)
        return
      }

      // 4. BACA JAWABAN

      setMessage(
        "Membaca jawaban siswa..."
      )

      const studentAnswers =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      // 5. HITUNG HASIL

      const result =
        calculateResult(
          studentAnswers,
          answerKeys
        )

      setCorrectionResult(
        result
      )

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

          <label className="mb-2 block font-semibold">
            Pilih Ujian
          </label>

          <select
            value={selectedExam}
            onChange={(e) =>
              setSelectedExam(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          >

            <option value="">
              -- Pilih ujian --
            </option>

            {exams.map((exam) => (

              <option
                key={exam.id}
                value={exam.id}
              >
                {exam.title ||
                  exam.name ||
                  "Ujian"}
              </option>

            ))}

          </select>

        </div>

        {/* SCANNER */}

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <h2 className="text-xl font-bold">
            Pindai Lembar Jawaban
          </h2>

          <p className="mt-1 text-gray-500">
            Pastikan 4 marker hitam terlihat.
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

              </>

            ) : (

              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">

                <div className="text-6xl">
                  📷
                </div>

                <h3 className="mt-4 text-xl font-bold">
                  Scanner Lembar Jawaban
                </h3>

                <button
                  onClick={startCamera}
                  disabled={!selectedExam}
                  className="mt-6 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white disabled:opacity-50"
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
                className="rounded-xl border px-6 py-3"
              >
                Batal
              </button>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex-1 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {scanning
                  ? "⏳ Memindai..."
                  : "🔍 Pindai Lembar Jawaban"}
              </button>

            </div>

          )}

          {message && (

            <div className="mt-5 rounded-xl bg-gray-100 p-4 text-center">

              {message}

            </div>

          )}

        </div>

        {/* HASIL */}

        {correctionResult && (

          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="text-2xl font-bold">
              🎉 Hasil Koreksi
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">

              <div className="rounded-xl bg-blue-50 p-5 text-center">

                <p>Nilai</p>

                <p className="text-4xl font-bold text-blue-600">
                  {correctionResult.score}
                </p>

              </div>

              <div className="rounded-xl bg-green-50 p-5 text-center">

                <p>Benar</p>

                <p className="text-4xl font-bold text-green-600">
                  {correctionResult.correct}
                </p>

              </div>

              <div className="rounded-xl bg-red-50 p-5 text-center">

                <p>Salah</p>

                <p className="text-4xl font-bold text-red-600">
                  {correctionResult.wrong}
                </p>

              </div>

              <div className="rounded-xl bg-gray-100 p-5 text-center">

                <p>Kosong</p>

                <p className="text-4xl font-bold">
                  {correctionResult.empty}
                </p>

              </div>

            </div>

            <div className="mt-6 overflow-x-auto">

              <table className="w-full border-collapse">

                <thead>

                  <tr className="border-b bg-gray-50">

                    <th className="p-3">
                      No
                    </th>

                    <th className="p-3">
                      Jawaban Siswa
                    </th>

                    <th className="p-3">
                      Kunci Jawaban
                    </th>

                    <th className="p-3">
                      Hasil
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {correctionResult.details.map(
                    (item) => (

                      <tr
                        key={item.number}
                        className="border-b text-center"
                      >

                        <td className="p-3">
                          {item.number}
                        </td>

                        <td className="p-3">
                          {item.studentAnswer ||
                            "-"}
                        </td>

                        <td className="p-3">
                          {item.correctAnswer}
                        </td>

                        <td className="p-3">

                          {item.status ===
                            "correct" &&
                            "✅ Benar"}

                          {item.status ===
                            "wrong" &&
                            "❌ Salah"}

                          {item.status ===
                            "empty" &&
                            "⬜ Kosong"}

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}

        {/* PREVIEW */}

        {preview && (

          <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">

            <h3 className="mb-3 text-xl font-bold">
              Hasil Scan yang Sudah Diluruskan
            </h3>

            <img
              src={preview}
              alt="Hasil scan"
              className="max-h-[700px] w-full object-contain"
            />

          </div>

        )}

      </div>

    </div>
  )
}

export default correction