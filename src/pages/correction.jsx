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
  const [calibratePoint, setCalibratePoint] = useState(null)

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

    // =========================
    // HAPUS DUPLIKAT question_number
    // Kalau ada nomor yang kembar,
    // ambil baris terakhir saja.
    // =========================

    const uniqueMap = new Map()

    ;(data || []).forEach((row) => {
      uniqueMap.set(row.question_number, row)
    })

    const uniqueKeys = Array.from(uniqueMap.values()).sort(
      (a, b) => a.question_number - b.question_number
    )

    return uniqueKeys
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
        String(studentAnswers[key.question_number] || "").trim().toUpperCase()

      const correctAnswer = String(key.answer || "").trim().toUpperCase()

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

  // =========================
// DETEKSI 4 MARKER LJK
// =========================

// =========================
// DETEKSI LJK - TAHAN MIRING
// =========================
// =====================================================
// DETEKSI LJK
// LEBIH LONGGAR:
// - LJK tidak harus tepat di tengah
// - LJK boleh miring
// - LJK boleh bergeser
// - selama kertas terlihat cukup jelas
// =====================================================

const detectAnswerSheet = (canvas) => {
  if (!window.cv || !window.cv.Mat) {
    return {
      detected: false,
      message: "OpenCV belum siap."
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blur = null
  let edges = null
  let dilated = null
  let contours = null
  let hierarchy = null
  let kernel = null

  try {
    src = cv.imread(canvas)

    const imageWidth = src.cols
    const imageHeight = src.rows
    const imageArea =
      imageWidth * imageHeight

    // =====================================================
    // 1. GRAYSCALE
    // =====================================================

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    // =====================================================
    // 2. BLUR
    // =====================================================

    blur = new cv.Mat()

    cv.GaussianBlur(
      gray,
      blur,
      new cv.Size(5, 5),
      0
    )

    // =====================================================
    // 3. EDGE
    // =====================================================

    edges = new cv.Mat()

    cv.Canny(
      blur,
      edges,
      40,
      120
    )

    // =====================================================
    // 4. DILATE
    // =====================================================

    kernel =
      cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(5, 5)
      )

    dilated = new cv.Mat()

    cv.dilate(
      edges,
      dilated,
      kernel,
      new cv.Point(-1, -1),
      2
    )

    // =====================================================
    // 5. CONTOUR
    // =====================================================

    contours =
      new cv.MatVector()

    hierarchy =
      new cv.Mat()

    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    )

    // =====================================================
    // 6. CARI KANDIDAT LJK
    // =====================================================

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

      // LJK harus cukup besar
      if (
        area <
          imageArea * 0.08 ||
        area >
          imageArea * 0.90
      ) {
        contour.delete()
        continue
      }

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
        0.02 * perimeter,
        true
      )

      // Harus 4 sisi
      if (
        approx.rows !== 4
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      const points = []

      for (
        let p = 0;
        p < 4;
        p++
      ) {
        points.push({
          x:
            approx.data32S[
              p * 2
            ],
          y:
            approx.data32S[
              p * 2 + 1
            ]
        })
      }

      // =================================================
      // 7. URUTKAN SUDUT
      // =================================================

      const topLeft =
        points.reduce(
          (best, p) =>
            p.x + p.y <
            best.x + best.y
              ? p
              : best
        )

      const bottomRight =
        points.reduce(
          (best, p) =>
            p.x + p.y >
            best.x + best.y
              ? p
              : best
        )

      const topRight =
        points.reduce(
          (best, p) =>
            p.x - p.y >
            best.x - best.y
              ? p
              : best
        )

      const bottomLeft =
        points.reduce(
          (best, p) =>
            p.x - p.y <
            best.x - best.y
              ? p
              : best
        )

      // =================================================
      // 8. UKURAN SISI
      // =================================================

      const widthTop =
        Math.hypot(
          topRight.x -
            topLeft.x,
          topRight.y -
            topLeft.y
        )

      const widthBottom =
        Math.hypot(
          bottomRight.x -
            bottomLeft.x,
          bottomRight.y -
            bottomLeft.y
        )

      const heightLeft =
        Math.hypot(
          bottomLeft.x -
            topLeft.x,
          bottomLeft.y -
            topLeft.y
        )

      const heightRight =
        Math.hypot(
          bottomRight.x -
            topRight.x,
          bottomRight.y -
            topRight.y
        )

      const averageWidth =
        (
          widthTop +
          widthBottom
        ) / 2

      const averageHeight =
        (
          heightLeft +
          heightRight
        ) / 2

      if (
        averageWidth <= 0 ||
        averageHeight <= 0
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      const ratio =
        averageWidth /
        averageHeight

      // =================================================
      // 9. RASIO F4
      // =================================================

      const f4Ratio =
        210 / 330

      const ratioDifference =
        Math.abs(
          ratio - f4Ratio
        )

      /*
       * F4 portrait sekitar 0.636.
       *
       * Kita masih beri toleransi karena
       * kamera bisa miring.
       */
      if (
        ratio < 0.48 ||
        ratio > 0.82
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      // =================================================
      // 10. CEK KEMIRINGAN SISI
      // =================================================

      const verticalDifference =
        Math.abs(
          heightLeft -
            heightRight
        ) /
        averageHeight

      const horizontalDifference =
        Math.abs(
          widthTop -
            widthBottom
        ) /
        averageWidth

      /*
       * Kalau perbedaan sisi terlalu besar,
       * kemungkinan bukan kertas.
       */
      if (
        verticalDifference >
          0.45 ||
        horizontalDifference >
          0.45
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      // =================================================
      // 11. SCORE KANDIDAT
      // =================================================

      /*
       * Jangan hanya memilih area terbesar.
       *
       * Kandidat yang bentuknya paling mendekati
       * F4 akan mendapat nilai lebih tinggi.
       */

      const ratioScore =
        Math.max(
          0,
          1 -
            ratioDifference /
              0.20
        )

      const sizeScore =
        Math.min(
          area /
            (imageArea * 0.50),
          1
        )

      const rectangleScore =
        Math.max(
          0,
          1 -
            (
              verticalDifference +
              horizontalDifference
            ) /
              0.90
        )

      const score =
        ratioScore * 0.55 +
        sizeScore * 0.25 +
        rectangleScore * 0.20

      candidates.push({
        area,
        ratio,
        score,
        points: [
          topLeft,
          topRight,
          bottomRight,
          bottomLeft
        ]
      })

      approx.delete()
      contour.delete()
    }

    // =====================================================
    // 12. TIDAK ADA LJK
    // =====================================================

    if (
      candidates.length === 0
    ) {
      return {
        detected: false,
        message:
          "❌ LJK belum terdeteksi. Pastikan seluruh kertas terlihat."
      }
    }

    // =====================================================
    // 13. PILIH KANDIDAT TERBAIK
    // =====================================================

    candidates.sort(
      (a, b) =>
        b.score -
        a.score
    )

    const best =
      candidates[0]

    const [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft
    ] = best.points

    // =====================================================
    // 14. VALIDASI UKURAN MINIMAL
    // =====================================================

    const paperWidth =
      (
        Math.hypot(
          topRight.x -
            topLeft.x,
          topRight.y -
            topLeft.y
        ) +
        Math.hypot(
          bottomRight.x -
            bottomLeft.x,
          bottomRight.y -
            bottomLeft.y
        )
      ) / 2

    const paperHeight =
      (
        Math.hypot(
          bottomLeft.x -
            topLeft.x,
          bottomLeft.y -
            topLeft.y
        ) +
        Math.hypot(
          bottomRight.x -
            topRight.x,
          bottomRight.y -
            topRight.y
        )
      ) / 2

    if (
      paperWidth <
        imageWidth * 0.20 ||
      paperHeight <
        imageHeight * 0.30
    ) {
      return {
        detected: false,
        message:
          "❌ LJK terlalu kecil. Dekatkan kertas ke kamera."
      }
    }

    // =====================================================
    // 15. MARKERS
    // =====================================================

    const markers = {
      topLeft: {
        x: topLeft.x,
        y: topLeft.y
      },

      topRight: {
        x: topRight.x,
        y: topRight.y
      },

      bottomLeft: {
        x: bottomLeft.x,
        y: bottomLeft.y
      },

      bottomRight: {
        x: bottomRight.x,
        y: bottomRight.y
      }
    }

    console.log(
      "===== LJK TERDETEKSI ====="
    )

    console.log(
      "Jumlah kandidat:",
      candidates.length
    )

    console.log(
      "Score:",
      best.score
    )

    console.log(
      "Rasio:",
      best.ratio
    )

    console.log(
      "TL:",
      markers.topLeft
    )

    console.log(
      "TR:",
      markers.topRight
    )

    console.log(
      "BL:",
      markers.bottomLeft
    )

    console.log(
      "BR:",
      markers.bottomRight
    )

    return {
      detected: true,
      message:
        "✅ LJK berhasil ditemukan.",
      markers
    }

  } catch (error) {
    console.error(
      "ERROR DETEKSI LJK:",
      error
    )

    return {
      detected: false,
      message:
        "❌ Gagal mendeteksi LJK."
    }

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blur) blur.delete()
    if (edges) edges.delete()
    if (dilated) dilated.delete()
    if (contours)
      contours.delete()
    if (hierarchy)
      hierarchy.delete()
    if (kernel)
      kernel.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
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

    const width = 840
    const height = 1320

    // ================================================
    // SOURCE
    // ================================================

    const srcPoints = [
      markers.topLeft.x,
      markers.topLeft.y,

      markers.topRight.x,
      markers.topRight.y,

      markers.bottomRight.x,
      markers.bottomRight.y,

      markers.bottomLeft.x,
      markers.bottomLeft.y
    ]

    // ================================================
    // DESTINATION
    // ================================================

    const dstPoints = [
      0,
      0,

      width - 1,
      0,

      width - 1,
      height - 1,

      0,
      height - 1
    ]

    srcTri =
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        srcPoints
      )

    dstTri =
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        dstPoints
      )

    // ================================================
    // PERSPECTIVE
    // ================================================

    matrix =
      cv.getPerspectiveTransform(
        srcTri,
        dstTri
      )

    dst = new cv.Mat()

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

    // ================================================
    // CANVAS HASIL
    // ================================================

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
      "ERROR WARP:",
      error
    )

    return null

  } finally {
    if (src) src.delete()
    if (dst) dst.delete()
    if (srcTri)
      srcTri.delete()
    if (dstTri)
      dstTri.delete()
    if (matrix)
      matrix.delete()
  }
}


// =====================================================
// BACA JAWABAN SISWA
// VERSI GRID TETAP SESUAI LAYOUT LJK
//
// Tidak menggunakan HoughCircles.
//
// Posisi bubble dihitung dari layout LJK yang dibuat
// oleh AnswerSheet.jsx.
//
// Jawaban ditentukan berdasarkan tinta paling tebal
// di bagian TENGAH bubble A-E.
//
// 40-70  = 2 kolom
// 80-100 = 3 kolom
// =====================================================

// =====================================================
// BACA JAWABAN SISWA
//
// CARA KERJA:
// 1. Deteksi semua bubble dengan HoughCircles
// 2. Kelompokkan bubble berdasarkan kolom
// 3. Di setiap kolom, cari baris yang berisi 5 bubble
// 4. 5 bubble dalam satu baris = A B C D E
// 5. Hitung tinta di bagian tengah setiap bubble
// 6. Tinta paling tebal = jawaban
//
// TIDAK menggunakan koordinat A-E yang tetap.
// Jadi posisi bubble dicari dari gambar.
//
// Foto boleh miring karena sebelumnya sudah di-warp.
// =====================================================

const readStudentAnswers = (
  canvas,
  totalQuestions
) => {
  if (
    !window.cv ||
    !window.cv.Mat
  ) {
    return {
      answers: {},
      debug: "❌ OpenCV belum siap.",
    }
  }

  const cv = window.cv

  let sourceMat = null
  let grayMat = null
  let blurMat = null
  let circleMat = null

  try {
    // =====================================================
    // KONFIGURASI
    // =====================================================

    const columnCount =
      totalQuestions >= 80
        ? 3
        : 2

    const questionsPerColumn =
      Math.ceil(
        totalQuestions /
          columnCount
      )

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    // =====================================================
    // BACA CANVAS HASIL WARP
    // =====================================================

    sourceMat =
      cv.imread(canvas)

    grayMat =
      new cv.Mat()

    cv.cvtColor(
      sourceMat,
      grayMat,
      cv.COLOR_RGBA2GRAY
    )

    blurMat =
      new cv.Mat()

    cv.GaussianBlur(
      grayMat,
      blurMat,
      new cv.Size(5, 5),
      0
    )

    // =====================================================
    // DETEKSI SEMUA BUBBLE
    //
    // Hough hanya digunakan untuk menemukan
    // posisi bubble.
    //
    // BUKAN menentukan jawabannya.
    // =====================================================

    circleMat =
      new cv.Mat()

    cv.HoughCircles(
      blurMat,
      circleMat,
      cv.HOUGH_GRADIENT,
      1,
      7,
      80,
      15,
      4,
      20
    )

    const rawBubbles = []

    for (
      let circleIndex = 0;
      circleIndex <
      circleMat.cols;
      circleIndex++
    ) {
      const centerX =
        circleMat.data32F[
          circleIndex * 3
        ]

      const centerY =
        circleMat.data32F[
          circleIndex * 3 + 1
        ]

      const radius =
        circleMat.data32F[
          circleIndex * 3 + 2
        ]

      if (
        !Number.isFinite(
          centerX
        ) ||
        !Number.isFinite(
          centerY
        ) ||
        !Number.isFinite(
          radius
        )
      ) {
        continue
      }

      // Buang header
      if (
        centerY <
        canvas.height * 0.18
      ) {
        continue
      }

      // Buang bagian essay
      if (
        centerY >
        canvas.height * 0.80
      ) {
        continue
      }

      if (
        radius < 4 ||
        radius > 20
      ) {
        continue
      }

      rawBubbles.push({
        centerX,
        centerY,
        radius,
      })
    }

    // =====================================================
    // HAPUS DUPLIKAT
    // =====================================================

    rawBubbles.sort(
      (firstBubble, secondBubble) =>
        firstBubble.centerY -
        secondBubble.centerY
    )

    const bubbles = []

    for (
      const bubble of rawBubbles
    ) {
      const duplicate =
        bubbles.some(
          existingBubble => {
            const deltaX =
              bubble.centerX -
              existingBubble.centerX

            const deltaY =
              bubble.centerY -
              existingBubble.centerY

            const distance =
              Math.sqrt(
                deltaX * deltaX +
                deltaY * deltaY
              )

            return (
              distance <
              Math.max(
                bubble.radius,
                existingBubble.radius
              ) * 0.75
            )
          }
        )

      if (!duplicate) {
        bubbles.push(
          bubble
        )
      }
    }

    // =====================================================
    // HITUNG TINTA
    //
    // HANYA BAGIAN TENGAH BUBBLE
    //
    // Garis lingkaran tidak dihitung.
    // =====================================================

    const measureInk = (
      bubble
    ) => {
      const centerX =
        bubble.centerX

      const centerY =
        bubble.centerY

      const radius =
        bubble.radius

      /*
       * Ambil bagian tengah.
       *
       * Kalau bubble dihitamkan,
       * bagian ini akan banyak pixel gelap.
       */

      const innerRadius =
        Math.max(
          2,
          radius * 0.45
        )

      let darkPixelCount = 0
      let totalPixelCount = 0

      const startColumn =
        Math.floor(
          centerX -
            innerRadius
        )

      const endColumn =
        Math.ceil(
          centerX +
            innerRadius
        )

      const startRow =
        Math.floor(
          centerY -
            innerRadius
        )

      const endRow =
        Math.ceil(
          centerY +
            innerRadius
        )

      for (
        let pixelRow =
          startRow;
        pixelRow <= endRow;
        pixelRow++
      ) {
        if (
          pixelRow < 0 ||
          pixelRow >=
            grayMat.rows
        ) {
          continue
        }

        for (
          let pixelColumn =
            startColumn;
          pixelColumn <=
            endColumn;
          pixelColumn++
        ) {
          if (
            pixelColumn < 0 ||
            pixelColumn >=
              grayMat.cols
          ) {
            continue
          }

          const deltaX =
            pixelColumn -
            centerX

          const deltaY =
            pixelRow -
            centerY

          const distanceSquared =
            deltaX * deltaX +
            deltaY * deltaY

          if (
            distanceSquared >
            innerRadius *
              innerRadius
          ) {
            continue
          }

          const grayValue =
            grayMat.ucharPtr(
              pixelRow,
              pixelColumn
            )[0]

          /*
           * 160 cukup sensitif
           * untuk pensil dari kamera HP.
           */

          if (
            grayValue < 160
          ) {
            darkPixelCount++
          }

          totalPixelCount++
        }
      }

      if (
        totalPixelCount === 0
      ) {
        return 0
      }

      return (
        darkPixelCount /
        totalPixelCount
      )
    }

    // =====================================================
    // KELOMPOKKAN BUBBLE BERDASARKAN KOLOM
    // =====================================================

    // =====================================================
    // KELOMPOKKAN BUBBLE MENJADI 15 JALUR
    //
    // TIDAK MENGGUNAKAN JARAK TETAP.
    //
    // Kita hanya menggunakan posisi X bubble
    // yang benar-benar ditemukan oleh kamera.
    //
    // 100 soal = 3 kolom
    // 3 kolom × 5 pilihan = 15 jalur
    // =====================================================

    const sortedBubbles =
      [...bubbles].sort(
        (
          firstBubble,
          secondBubble
        ) =>
          firstBubble.centerX -
          secondBubble.centerX
      )

    const expectedTrackCount =
      columnCount * 5

    // =====================================================
    // AMBIL TITIK X UNTUK SETIAP BUBBLE
    // =====================================================

    let trackCenters =
      []

    for (
      const bubble of sortedBubbles
    ) {
      trackCenters.push(
        bubble.centerX
      )
    }

    // =====================================================
    // K-MEANS 1 DIMENSI
    //
    // Kita tidak menentukan jarak bubble.
    //
    // Sistem sendiri mencari 15 kelompok
    // berdasarkan distribusi posisi X.
    // =====================================================

    let centers = []

    // Ambil titik awal yang tersebar merata
    for (
      let i = 0;
      i < expectedTrackCount;
      i++
    ) {
      const position =
        Math.floor(
          (
            i *
            (
              trackCenters.length -
              1
            )
          ) /
          (
            expectedTrackCount -
            1
          )
        )

      centers.push(
        trackCenters[position]
      )
    }

    // =====================================================
    // ULANGI PENGELOMPOKAN
    // =====================================================

    for (
      let iteration = 0;
      iteration < 30;
      iteration++
    ) {
      const groups =
        Array.from(
          {
            length:
              expectedTrackCount,
          },
          () => []
        )

      // -----------------------------------------------
      // Masukkan setiap bubble ke pusat terdekat
      // -----------------------------------------------

      for (
        const bubble of sortedBubbles
      ) {
        let nearestIndex = 0

        let nearestDistance =
          Infinity

        for (
          let centerIndex = 0;
          centerIndex <
            centers.length;
          centerIndex++
        ) {
          const distance =
            Math.abs(
              bubble.centerX -
              centers[centerIndex]
            )

          if (
            distance <
            nearestDistance
          ) {
            nearestDistance =
              distance

            nearestIndex =
              centerIndex
          }
        }

        groups[
          nearestIndex
        ].push(
          bubble
        )
      }

      // -----------------------------------------------
      // Hitung ulang pusat setiap jalur
      // -----------------------------------------------

      const newCenters =
        []

      for (
        let groupIndex = 0;
        groupIndex <
          groups.length;
        groupIndex++
      ) {
        const group =
          groups[groupIndex]

        if (
          group.length === 0
        ) {
          newCenters.push(
            centers[groupIndex]
          )

          continue
        }

        const averageX =
          group.reduce(
            (
              sum,
              bubble
            ) =>
              sum +
              bubble.centerX,
            0
          ) /
          group.length

        newCenters.push(
          averageX
        )
      }

      // -----------------------------------------------
      // Cek apakah sudah stabil
      // -----------------------------------------------

      let movement = 0

      for (
        let centerIndex = 0;
        centerIndex <
          centers.length;
        centerIndex++
      ) {
        movement +=
          Math.abs(
            centers[
              centerIndex
            ] -
            newCenters[
              centerIndex
            ]
          )
      }

      centers =
        newCenters

      if (
        movement < 0.5
      ) {
        break
      }
    }

    // =====================================================
    // BUAT TRACK FINAL
    // =====================================================

    const xClusters =
      centers
        .map(
          (
            centerX,
            centerIndex
          ) => ({
            centerX,
            bubbles:
              [],
            index:
              centerIndex,
          })
        )
        .sort(
          (
            firstCluster,
            secondCluster
          ) =>
            firstCluster.centerX -
            secondCluster.centerX
        )

    // =====================================================
    // MASUKKAN BUBBLE KE TRACK TERDEKAT
    // =====================================================

    for (
      const bubble of sortedBubbles
    ) {
      let nearestCluster =
        null

      let nearestDistance =
        Infinity

      for (
        const cluster of
          xClusters
      ) {
        const distance =
          Math.abs(
            bubble.centerX -
            cluster.centerX
          )

        if (
          distance <
          nearestDistance
        ) {
          nearestDistance =
            distance

          nearestCluster =
            cluster
        }
      }

      if (
        nearestCluster
      ) {
        nearestCluster.bubbles.push(
          bubble
        )
      }
    }

    // =====================================================
    // URUTKAN TRACK DARI KIRI → KANAN
    // =====================================================

    xClusters.sort(
      (
        firstCluster,
        secondCluster
      ) =>
        firstCluster.centerX -
        secondCluster.centerX
    )

    // =====================================================
    // DEBUG TRACK
    // =====================================================

    console.log(
      "TRACK X:",
      xClusters.map(
        cluster =>
          Math.round(
            cluster.centerX
          )
      )
    )

    console.log(
      "JUMLAH BUBBLE PER TRACK:",
      xClusters.map(
        cluster =>
          cluster.bubbles.length
      )
    )

    // =====================================================
    // CEK 15 TRACK
    // =====================================================

    if (
      xClusters.length <
      expectedTrackCount
    ) {
      return {
        answers: {},
        debug:
          `❌ Jalur tidak lengkap: ` +
          `${xClusters.length}/${expectedTrackCount} | ` +
          `Bubble: ${bubbles.length}`,
      }
    }

    // =====================================================
    // BAGI MENJADI KOLOM
    //
    // Track:
    // A B C D E | A B C D E | A B C D E
    // =====================================================

    const columns = []

    for (
      let columnNumber = 0;
      columnNumber <
        columnCount;
      columnNumber++
    ) {
      const startIndex =
        columnNumber * 5

      const endIndex =
        startIndex + 5

      const column =
        xClusters.slice(
          startIndex,
          endIndex
        )

      columns.push(
        column
      )
    }

    // =====================================================
    // CARI BARIS
    //
    // TIDAK MEMAKAI POSISI SOAL YANG DI-HARDCODE.
    //
    // Bubble yang ditemukan dari gambar
    // dikelompokkan berdasarkan posisi vertikal.
    // =====================================================

    const groupRows = (
      column
    ) => {
      const allBubbles = []

      column.forEach(
        track => {
          track.bubbles.forEach(
            bubble => {
              allBubbles.push(
                bubble
              )
            }
          )
        }
      )

      allBubbles.sort(
        (
          firstBubble,
          secondBubble
        ) =>
          firstBubble.centerY -
          secondBubble.centerY
      )

      const rows = []

      /*
       * Karena bubble sudah di-warp,
       * jarak antar baris relatif rapat.
       *
       * Toleransi ini hanya untuk
       * mengelompokkan bubble yang
       * memang berada pada baris sama.
       */

      const rowTolerance =
        9

      for (
        const bubble of allBubbles
      ) {
        let nearestRow =
          null

        let nearestDistance =
          Infinity

        for (
          const row of rows
        ) {
          const distance =
            Math.abs(
              bubble.centerY -
              row.centerY
            )

          if (
            distance <
            nearestDistance
          ) {
            nearestDistance =
              distance

            nearestRow =
              row
          }
        }

        if (
          nearestRow &&
          nearestDistance <=
            rowTolerance
        ) {
          nearestRow.bubbles.push(
            bubble
          )

          nearestRow.centerY =
            nearestRow.bubbles.reduce(
              (
                sum,
                item
              ) =>
                sum +
                item.centerY,
              0
            ) /
            nearestRow.bubbles.length
        } else {
          rows.push({
            centerY:
              bubble.centerY,
            bubbles: [
              bubble,
            ],
          })
        }
      }

      return rows
        .filter(
          row =>
            row.bubbles.length >=
            3
        )
        .sort(
          (
            firstRow,
            secondRow
          ) =>
            firstRow.centerY -
            secondRow.centerY
        )
    }

    // =====================================================
    // BACA JAWABAN
    // =====================================================

    const answers = {}

    let questionNumber = 1
    let answeredCount = 0
    let doubleCount = 0

    const rowDebug = []

    for (
      let columnNumber = 0;
      columnNumber <
        columns.length;
      columnNumber++
    ) {
      const column =
        columns[
          columnNumber
        ]

      const rows =
        groupRows(
          column
        )

      const expectedRows =
        Math.min(
          questionsPerColumn,
          totalQuestions -
            columnNumber *
              questionsPerColumn
        )

      const usableRows =
        rows.slice(
          0,
          expectedRows
        )

      rowDebug.push(
        usableRows.length
      )

      // ===================================================
      // SETIAP BARIS = SATU SOAL
      // ===================================================

      for (
        let rowNumber = 0;
        rowNumber <
          usableRows.length;
        rowNumber++
      ) {
        if (
          questionNumber >
          totalQuestions
        ) {
          break
        }

        const currentRow =
          usableRows[
            rowNumber
          ]

        /*
         * Cari 5 bubble pada baris ini.
         *
         * Urutan kiri → kanan:
         *
         * A B C D E
         */

        const rowBubbles =
          [...currentRow.bubbles]
            .sort(
              (
                firstBubble,
                secondBubble
              ) =>
                firstBubble.centerX -
                secondBubble.centerX
            )

        /*
         * Kalau ada lebih dari 5,
         * pilih 5 bubble yang paling
         * mendekati posisi jalur A-E.
         */

        const selectedBubbles = []

        for (
          const track of column
        ) {
          let nearestBubble =
            null

          let nearestDistance =
            Infinity

          for (
            const bubble of
              rowBubbles
          ) {
            const distance =
              Math.abs(
                bubble.centerX -
                track.centerX
              )

            if (
              distance <
              nearestDistance
            ) {
              nearestDistance =
                distance

              nearestBubble =
                bubble
            }
          }

          if (
            nearestBubble &&
            !selectedBubbles.includes(
              nearestBubble
            )
          ) {
            selectedBubbles.push(
              nearestBubble
            )
          }
        }

        // =================================================
        // HITUNG TINTA A-E
        // =================================================

        const inkValues = []

        for (
          let choiceNumber = 0;
          choiceNumber < 5;
          choiceNumber++
        ) {
          const bubble =
            selectedBubbles[
              choiceNumber
            ]

          if (!bubble) {
            inkValues.push(0)
            continue
          }

          inkValues.push(
            measureInk(
              bubble
            )
          )
        }

        // =================================================
        // CARI TINTA TERBESAR
        // =================================================

        let highestIndex = 0

        for (
          let choiceNumber = 1;
          choiceNumber <
            inkValues.length;
          choiceNumber++
        ) {
          if (
            inkValues[
              choiceNumber
            ] >
            inkValues[
              highestIndex
            ]
          ) {
            highestIndex =
              choiceNumber
          }
        }

        const sortedInk =
          [...inkValues].sort(
            (firstValue, secondValue) =>
              secondValue -
              firstValue
          )

        const highest =
          sortedInk[0] || 0

        const second =
          sortedInk[1] || 0

        /*
         * Kita tidak membuat jawaban kosong
         * hanya karena tintanya sedikit.
         *
         * Kalau ada bubble yang terdeteksi,
         * pilih tinta paling tinggi.
         */

        if (
          highest <= 0
        ) {
          answers[
            questionNumber
          ] = ""

        } else {
          answers[
            questionNumber
          ] =
            choices[
              highestIndex
            ]

          answeredCount++
        }

        /*
         * Ganda hanya sebagai informasi.
         * Tidak mengubah jawaban menjadi kosong.
         */

        if (
          highest > 0 &&
          second >
            highest * 0.90
        ) {
          doubleCount++
        }

        console.log(
          `SOAL ${questionNumber}`,
          {
            kolom:
              columnNumber + 1,

            baris:
              rowNumber + 1,

            tintaA:
              Number(
                (
                  inkValues[0] ||
                  0
                ).toFixed(3)
              ),

            tintaB:
              Number(
                (
                  inkValues[1] ||
                  0
                ).toFixed(3)
              ),

            tintaC:
              Number(
                (
                  inkValues[2] ||
                  0
                ).toFixed(3)
              ),

            tintaD:
              Number(
                (
                  inkValues[3] ||
                  0
                ).toFixed(3)
              ),

            tintaE:
              Number(
                (
                  inkValues[4] ||
                  0
                ).toFixed(3)
              ),

            jawaban:
              choices[
                highestIndex
              ],
          }
        )

        questionNumber++
      }
    }

    // =====================================================
    // DEBUG
    // =====================================================

    const debug =
      `📝 Mode tinta` +
      ` | Kolom: ${columnCount}` +
      ` | Baris: ${rowDebug.join("/")}` +
      ` | Baca: ${answeredCount}/${totalQuestions}` +
      ` | Ganda: ${doubleCount}`

    console.log(
      "=============================="
    )

    console.log(
      "HASIL OMR:",
      answers
    )

    console.log(
      "DEBUG:",
      debug
    )

    console.log(
      "=============================="
    )

    return {
      answers,
      debug,
    }

  } catch (error) {
    console.error(
      "ERROR READ STUDENT ANSWERS:",
      error
    )

    return {
      answers: {},
      debug:
        `❌ Gagal membaca jawaban: ${
          error?.message ||
          "error tidak diketahui"
        }`,
    }

  } finally {
    if (sourceMat)
      sourceMat.delete()

    if (grayMat)
      grayMat.delete()

    if (blurMat)
      blurMat.delete()

    if (circleMat)
      circleMat.delete()
  }
}

// const handlePreviewClick = (e) => {
//   const img = e.target
//   const rect = img.getBoundingClientRect()
//   const naturalWidth = img.naturalWidth
//   const naturalHeight = img.naturalHeight

//   const containerRatio = rect.width / rect.height
//   const imageRatio = naturalWidth / naturalHeight

//   let renderedWidth, renderedHeight, offsetX, offsetY

//   if (imageRatio > containerRatio) {
//     renderedWidth = rect.width
//     renderedHeight = rect.width / imageRatio
//     offsetX = 0
//     offsetY = (rect.height - renderedHeight) / 2
//   } else {
//     renderedHeight = rect.height
//     renderedWidth = rect.height * imageRatio
//     offsetY = 0
//     offsetX = (rect.width - renderedWidth) / 2
//   }

//   const clickX = e.clientX - rect.left - offsetX
//   const clickY = e.clientY - rect.top - offsetY

//   if (clickX < 0 || clickY < 0 || clickX > renderedWidth || clickY > renderedHeight) {
//     return
//   }

//   const naturalX = Math.round((clickX / renderedWidth) * naturalWidth)
//   const naturalY = Math.round((clickY / renderedHeight) * naturalHeight)

//   setCalibratePoint({ x: naturalX, y: naturalY })
// }

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

      if (detection.detected) {
        setMessage(
        `Marker terdeteksi:
          TL(${Math.round(detection.markers.topLeft.x)}, ${Math.round(detection.markers.topLeft.y)})
          TR(${Math.round(detection.markers.topRight.x)}, ${Math.round(detection.markers.topRight.y)})
          BL(${Math.round(detection.markers.bottomLeft.x)}, ${Math.round(detection.markers.bottomLeft.y)})
          BR(${Math.round(detection.markers.bottomRight.x)}, ${Math.round(detection.markers.bottomRight.y)})`
        )
      }

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

      if (!correctedCanvas) {
        setMessage(
          "Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      console.log(
        "UKURAN HASIL WARP:",
        correctedCanvas.width,
        correctedCanvas.height
      )

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
      const scanResult =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "HASIL PEMBACAAN:",
        scanResult
      )

      const detectedAnswers =
        scanResult?.answers || {}

      setStudentAnswers(
        detectedAnswers
      )

      // Tampilkan debug di HP
      setMessage(
        scanResult?.debug || "Gagal Membaca Lembar Jawaban"
      )

      // Hitung hasil
      const resultCorrection =
        calculateResult(
          detectedAnswers,
          answerKeys
        )

      setCorrectionResult(
        resultCorrection
      )

      setMessage(
        `${scanResult?.debug || "Pembacaan selesai."} | Koreksi selesai! 🎉`
      )
    } catch (error) {
      console.error(
        "SCAN ERROR DETAIL:",
        error
      )

      console.error(
        "ERROR MESSAGE:",
        error?.message
      )

      setMessage(
        `Terjadi kesalahan: ${
          error?.message || "tidak diketahui"
        }`
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
                    Pastikan seluruh LJK berada di dalam kotak
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
                  onClick={(e) => {
                    const img = e.currentTarget
                    const rect = img.getBoundingClientRect()

                    const x =
                      Math.round(
                        ((e.clientX - rect.left) / rect.width) *
                          img.naturalWidth
                      )

                    const circleY =
                      Math.round(
                        ((e.clientY - rect.top) / rect.height) *
                          img.naturalHeight
                      )

                    setCalibratePoint({
                      x,
                      circleY
                    })
                  }}
                  className="block w-full cursor-crosshair object-contain"
                />
              </div>

              {calibratePoint && (
                <div className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-center text-sm font-mono text-white">
                  Koordinat diklik: X = {calibratePoint.x}, Y = {calibratePoint.y}
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  )
}

export default correction