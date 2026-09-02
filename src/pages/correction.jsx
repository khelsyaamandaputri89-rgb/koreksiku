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

  // =========================
  // LOAD
  // =========================

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
      console.error(
        "Error mengambil ujian:",
        error
      )
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
      .order("question_number", {
        ascending: true,
      })

    if (error) {
      console.error(
        "Error mengambil kunci:",
        error
      )

      return []
    }

    return data || []
  }

  // =========================
  // HITUNG HASIL
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
      const studentAnswer =
        studentAnswers[
          key.question_number
        ] || ""

      const correctAnswer =
        String(key.answer || "")
          .trim()
          .toUpperCase()

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
  // KAMERA
  // =========================

  const startCamera = async () => {
    try {
      setMessage("")

      if (!selectedExam) {
        setMessage(
          "Silakan pilih ujian terlebih dahulu."
        )
        return
      }

      if (!studentName.trim()) {
        setMessage(
          "Silakan masukkan nama siswa terlebih dahulu."
        )
        return
      }

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
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
          }
        )

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
        .forEach((track) => {
          track.stop()
        })

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

  // =====================================================
  // DETEKSI MARKER
  // =====================================================

  const detectAnswerSheet = (canvas) => {
    if (
      !window.cv ||
      !window.cv.Mat
    ) {
      return {
        detected: false,
        message:
          "OpenCV belum siap.",
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

      const imageWidth = src.cols
      const imageHeight = src.rows

      gray = new cv.Mat()

      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      /*
        Threshold khusus mencari
        objek hitam.
      */

      binary = new cv.Mat()

      cv.threshold(
        gray,
        binary,
        90,
        255,
        cv.THRESH_BINARY_INV
      )

      /*
        Bersihkan noise kecil.
      */

      const kernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(3, 3)
      )

      cv.morphologyEx(
        binary,
        binary,
        cv.MORPH_OPEN,
        kernel
      )

      kernel.delete()

      contours = new cv.MatVector()
      hierarchy = new cv.Mat()

      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )

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

        /*
          Marker harus cukup besar,
          tapi jangan terlalu besar.
        */

        if (
          area < 250 ||
          area > 15000
        ) {
          contour.delete()
          continue
        }

        const rect =
          cv.boundingRect(contour)

        const width = rect.width
        const height = rect.height

        if (
          width < 12 ||
          height < 12
        ) {
          contour.delete()
          continue
        }

        /*
          Marker berbentuk hampir kotak.
        */

        const ratio =
          width / height

        if (
          ratio < 0.65 ||
          ratio > 1.5
        ) {
          contour.delete()
          continue
        }

        /*
          Marker harus mempunyai
          kepadatan hitam yang cukup.
        */

        const rectArea =
          width * height

        const fillRatio =
          area / rectArea

        if (fillRatio < 0.45) {
          contour.delete()
          continue
        }

        /*
          Cari polygon.
        */

        const perimeter =
          cv.arcLength(
            contour,
            true
          )

        const approx =
          new cv.Mat()

        cv.approxPolyDP(
          contour,
          approx,
          0.04 * perimeter,
          true
        )

        /*
          Marker biasanya berupa
          bentuk kotak.
        */

        if (
          approx.rows >= 4 &&
          approx.rows <= 8
        ) {
          const centerX =
            rect.x +
            rect.width / 2

          const centerY =
            rect.y +
            rect.height / 2

          candidates.push({
            x: centerX,
            y: centerY,
            width,
            height,
            area,
            fillRatio,
          })
        }

        approx.delete()
        contour.delete()
      }

      console.log(
        "================================"
      )

      console.log(
        "SEMUA KANDIDAT MARKER:",
        candidates
      )

      console.log(
        "Jumlah kandidat:",
        candidates.length
      )

      /*
        Minimal harus ada 4 kandidat.
      */

      if (
        candidates.length < 4
      ) {
        return {
          detected: false,
          message:
            `Marker hitam terdeteksi ${candidates.length}/4. Pastikan 4 marker pada LJK terlihat jelas.`,
        }
      }

      // =================================================
      // CARI MARKER TERDEKAT DENGAN 4 SUDUT GAMBAR
      // =================================================

      const corners = [
        {
          name: "TL",
          x: 0,
          y: 0,
        },
        {
          name: "TR",
          x: imageWidth,
          y: 0,
        },
        {
          name: "BL",
          x: 0,
          y: imageHeight,
        },
        {
          name: "BR",
          x: imageWidth,
          y: imageHeight,
        },
      ]

      /*
        Hitung jarak setiap kandidat
        ke masing-masing sudut.
      */

      const distance = (
        a,
        b
      ) => {
        const dx =
          a.x - b.x

        const dy =
          a.y - b.y

        return Math.sqrt(
          dx * dx +
            dy * dy
        )
      }

      /*
        Untuk setiap sudut,
        ambil kandidat terdekat.
      */

      const selectedMarkers = {}

      const used = new Set()

      corners.forEach(
        (corner) => {
          const sorted =
            [...candidates].sort(
              (a, b) =>
                distance(a, corner) -
                distance(b, corner)
            )

          for (
            const candidate of sorted
          ) {
            const key =
              `${Math.round(candidate.x)}_${Math.round(candidate.y)}`

            if (
              !used.has(key)
            ) {
              selectedMarkers[
                corner.name
              ] = candidate

              used.add(key)

              break
            }
          }
        }
      )

      /*
        Pastikan lengkap.
      */

      if (
        !selectedMarkers.TL ||
        !selectedMarkers.TR ||
        !selectedMarkers.BL ||
        !selectedMarkers.BR
      ) {
        return {
          detected: false,
          message:
            "4 marker belum dapat dipisahkan. Posisikan seluruh LJK masuk kamera.",
        }
      }

      /*
        Cek jarak antar marker.
        Kalau terlalu dekat berarti
        ada marker yang salah terpilih.
      */

      const minHorizontal =
        imageWidth * 0.20

      const minVertical =
        imageHeight * 0.20

      const horizontalTop =
        Math.abs(
          selectedMarkers.TR.x -
            selectedMarkers.TL.x
        )

      const horizontalBottom =
        Math.abs(
          selectedMarkers.BR.x -
            selectedMarkers.BL.x
        )

      const verticalLeft =
        Math.abs(
          selectedMarkers.BL.y -
            selectedMarkers.TL.y
        )

      const verticalRight =
        Math.abs(
          selectedMarkers.BR.y -
            selectedMarkers.TR.y
        )

      if (
        horizontalTop <
          minHorizontal ||
        horizontalBottom <
          minHorizontal ||
        verticalLeft <
          minVertical ||
        verticalRight <
          minVertical
      ) {
        console.log(
          "Marker terlalu berdekatan:",
          selectedMarkers
        )

        return {
          detected: false,
          message:
            "Marker terdeteksi tetapi posisinya tidak membentuk 4 sudut LJK. Coba jauhkan/rapikan posisi kamera.",
        }
      }

      /*
        Pastikan urutan benar.
      */

      const markers = {
        topLeft:
          selectedMarkers.TL,

        topRight:
          selectedMarkers.TR,

        bottomLeft:
          selectedMarkers.BL,

        bottomRight:
          selectedMarkers.BR,
      }

      console.log(
        "================================"
      )

      console.log(
        "4 MARKER TERPILIH:",
        markers
      )

      console.log(
        "TL:",
        markers.topLeft.x,
        markers.topLeft.y
      )

      console.log(
        "TR:",
        markers.topRight.x,
        markers.topRight.y
      )

      console.log(
        "BL:",
        markers.bottomLeft.x,
        markers.bottomLeft.y
      )

      console.log(
        "BR:",
        markers.bottomRight.x,
        markers.bottomRight.y
      )

      console.log(
        "================================"
      )

      return {
        detected: true,
        message:
          "4 marker berhasil ditemukan! ✅",
        markers,
      }

    } catch (error) {
      console.error(
        "Error deteksi marker:",
        error
      )

      return {
        detected: false,
        message:
          "Gagal mendeteksi marker LJK.",
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (binary) binary.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  // =====================================================
  // WARP / LURUSKAN LJK
  // =====================================================

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
        Ukuran hasil akhir.
      */

      const width = 900
      const height = 1200

      dst = new cv.Mat()

      /*
        Ambil titik tengah marker.
      */

      const srcPoints = [
        markers.topLeft.x,
        markers.topLeft.y,

        markers.topRight.x,
        markers.topRight.y,

        markers.bottomRight.x,
        markers.bottomRight.y,

        markers.bottomLeft.x,
        markers.bottomLeft.y,
      ]

      console.log(
        "TITIK WARP:",
        srcPoints
      )

      srcTri =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          srcPoints
        )

      /*
        Titik tujuan.

        Urutan HARUS:

        TL
        TR
        BR
        BL
      */

      const dstPoints = [
        0,
        0,

        width - 1,
        0,

        width - 1,
        height - 1,

        0,
        height - 1,
      ]

      dstTri =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          dstPoints
        )

      matrix =
        cv.getPerspectiveTransform(
          srcTri,
          dstTri
        )

      console.log(
        "MATRIX PERSPEKTIF:",
        matrix
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
        document.createElement(
          "canvas"
        )

      resultCanvas.width =
        width

      resultCanvas.height =
        height

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

  // =====================================================
  // BACA JAWABAN
  // =====================================================

  const readStudentAnswers = (
    canvas,
    totalQuestions
  ) => {
    if (
      !window.cv ||
      !window.cv.Mat
    ) {
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
        900 x 1200
      */

      const columns = 2

      const questionsPerColumn =
        Math.ceil(
          totalQuestions /
            columns
        )

      /*
        AREA JAWABAN
      */

      const startY = 245
      const endY = 470

      const leftColumnStartX = 170
      const rightColumnStartX = 490

      const rowHeight =
        (endY - startY) /
        questionsPerColumn

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
        questionIndex <
        totalQuestions;
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

        const rowY =
          startY +
          rowIndex *
            rowHeight

        const columnStartX =
          columnIndex === 0
            ? leftColumnStartX
            : rightColumnStartX

        let highestInk = 0
        let secondHighestInk = 0

        let selectedAnswer = ""

        for (
          let choiceIndex = 0;
          choiceIndex <
          choices.length;
          choiceIndex++
        ) {
          const bubbleX =
            columnStartX +
            choiceIndex *
              bubbleGap

          const bubbleY =
            rowY

          /*
            Ambil bagian tengah bubble.
          */

          const padding = 5

          const roiX =
            Math.round(
              bubbleX +
                padding
            )

          const roiY =
            Math.round(
              bubbleY +
                padding
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

          if (
            roiX < 0 ||
            roiY < 0 ||
            roiX +
                roiWidth >
              binary.cols ||
            roiY +
                roiHeight >
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
            cv.countNonZero(
              roi
            )

          roi.delete()

          console.log(
            `Soal ${questionNumber} - ${choices[choiceIndex]}:`,
            ink
          )

          if (
            ink > highestInk
          ) {
            secondHighestInk =
              highestInk

            highestInk = ink

            selectedAnswer =
              choices[
                choiceIndex
              ]
          } else if (
            ink >
            secondHighestInk
          ) {
            secondHighestInk =
              ink
          }
        }

        /*
          Minimal tinta.
        */

        const minimumInk = 15

        /*
          Kalau dua bubble sama-sama
          tinggi, anggap kosong.
        */

        const isAmbiguous =
          secondHighestInk >
          highestInk * 0.75

        if (
          highestInk <
            minimumInk ||
          isAmbiguous
        ) {
          answers[
            questionNumber
          ] = ""
        } else {
          answers[
            questionNumber
          ] =
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

  // =====================================================
  // SCAN
  // =====================================================

  const handleScan = async () => {
    if (!videoRef.current)
      return

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      /*
        Ambil kunci jawaban.
      */

      const answerKeys =
        await getAnswerKey()

      if (
        answerKeys.length === 0
      ) {
        setMessage(
          "Kunci jawaban untuk ujian ini belum tersedia."
        )

        setScanning(false)
        return
      }

      const video =
        videoRef.current

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

      /*
        Ambil foto.
      */

      const canvas =
        document.createElement(
          "canvas"
        )

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

      console.log(
        "UKURAN FOTO:",
        canvas.width,
        canvas.height
      )

      setMessage(
        "Mendeteksi 4 marker LJK..."
      )

      /*
        DETEKSI MARKER
      */

      const detection =
        detectAnswerSheet(
          canvas
        )

      console.log(
        "HASIL DETEKSI:",
        detection
      )

      if (
        !detection.detected
      ) {
        setMessage(
          detection.message
        )

        /*
          Tampilkan foto asli
          supaya bisa melihat masalahnya.
        */

        const imageUrl =
          canvas.toDataURL(
            "image/jpeg",
            0.9
          )

        setPreview(imageUrl)

        setScanning(false)
        return
      }

      /*
        Tampilkan koordinat.
      */

      const m =
        detection.markers

      setMessage(
        `4 marker terdeteksi ✅
TL: ${Math.round(m.topLeft.x)}, ${Math.round(m.topLeft.y)}
TR: ${Math.round(m.topRight.x)}, ${Math.round(m.topRight.y)}
BL: ${Math.round(m.bottomLeft.x)}, ${Math.round(m.bottomLeft.y)}
BR: ${Math.round(m.bottomRight.x)}, ${Math.round(m.bottomRight.y)}`
      )

      /*
        LURUSKAN
      */

      setMessage(
        "Meluruskan lembar jawaban..."
      )

      const correctedCanvas =
        warpAnswerSheet(
          canvas,
          detection.markers
        )

      if (
        !correctedCanvas
      ) {
        setMessage(
          "Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      /*
        Preview hasil warp.
      */

      const imageUrl =
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )

      setPreview(imageUrl)

      /*
        BACA JAWABAN
      */

      setMessage(
        "Membaca jawaban siswa..."
      )

      const detectedAnswers =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "JAWABAN SISWA:",
        detectedAnswers
      )

      setStudentAnswers(
        detectedAnswers
      )

      /*
        HITUNG HASIL
      */

      const resultCorrection =
        calculateResult(
          detectedAnswers,
          answerKeys
        )

      setCorrectionResult(
        resultCorrection
      )

      setMessage(
        "Koreksi selesai! 🎉"
      )
    } catch (error) {
      console.error(
        "SCAN ERROR:",
        error
      )

      setMessage(
        "Terjadi kesalahan saat memindai."
      )
    }

    setScanning(false)
  }

  // =====================================================
  // UI
  // =====================================================

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
              setSelectedExam(
                e.target.value
              )

              setCorrectionResult(
                null
              )

              setStudentAnswers(
                {}
              )

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
                {exam.title ||
                  exam.name ||
                  "Ujian"}
              </option>
            ))}

          </select>

          {/* NAMA SISWA */}

          <div className="mt-5">

            <label className="mb-2 block font-semibold text-slate-700">
              Nama Siswa
            </label>

            <input
              type="text"
              value={studentName}
              onChange={(e) =>
                setStudentName(
                  e.target.value
                )
              }
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

                {/* OVERLAY */}

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
                  onClick={
                    startCamera
                  }
                  disabled={
                    !selectedExam ||
                    !studentName.trim()
                  }
                  className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📷 Buka Scanner
                </button>

              </div>

            )}

          </div>

          {/* BUTTON */}

          {cameraOpen && (

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={
                  stopCamera
                }
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>

              <button
                onClick={
                  handleScan
                }
                disabled={
                  scanning
                }
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

            <div className="mt-5 whitespace-pre-line rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>

          )}

          {/* ================================================= */}
          {/* HASIL KOREKSI */}
          {/* ================================================= */}

          {correctionResult && (

            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">

              <h2 className="text-2xl font-bold text-slate-800">
                🎉 Hasil Koreksi
              </h2>

              <p className="mt-2 text-gray-500">
                Nama Siswa:{" "}
                <span className="font-semibold text-slate-800">
                  {studentName}
                </span>
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">

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

              {/* DETAIL */}

              <div className="mt-6 overflow-x-auto">

                <table className="w-full border-collapse">

                  <thead>

                    <tr className="border-b bg-gray-50 text-left">

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
                          key={
                            item.number
                          }
                          className="border-b"
                        >

                          <td className="p-3">
                            {
                              item.number
                            }
                          </td>

                          <td className="p-3">
                            {
                              item.studentAnswer ||
                              "-"
                            }
                          </td>

                          <td className="p-3">
                            {
                              item.correctAnswer
                            }
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

          {/* ================================================= */}
          {/* PREVIEW */}
          {/* ================================================= */}

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