import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"

function Correction() {
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
    if (
      cameraOpen &&
      videoRef.current &&
      streamRef.current
    ) {
      videoRef.current.srcObject =
        streamRef.current
    }
  }, [cameraOpen])

  // =====================================================
  // AMBIL DATA UJIAN
  // =====================================================

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

  // =====================================================
  // AMBIL KUNCI JAWABAN
  // =====================================================

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
        "Error mengambil kunci jawaban:",
        error
      )

      return []
    }

    const uniqueMap = new Map()

    ;(data || []).forEach((row) => {
      uniqueMap.set(
        row.question_number,
        row
      )
    })

    return Array.from(
      uniqueMap.values()
    ).sort(
      (a, b) =>
        Number(a.question_number) -
        Number(b.question_number)
    )
  }

  // =====================================================
  // HITUNG HASIL
  // =====================================================

  const calculateResult = (
    studentAnswers,
    answerKeys
  ) => {
    let correct = 0
    let wrong = 0
    let empty = 0

    const details = []

    answerKeys.forEach((key) => {
      const studentAnswer = String(
        studentAnswers[
          key.question_number
        ] || ""
      )
        .trim()
        .toUpperCase()

      const correctAnswer = String(
        key.answer || ""
      )
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

  // =====================================================
  // KAMERA
  // =====================================================

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
  // HELPER JARAK
  // =====================================================

  const distance = (a, b) => {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2)
    )
  }

  // =====================================================
  // URUTKAN 4 MARKER
  // =====================================================

  const orderMarkers = (points) => {
    if (!points || points.length !== 4) {
      return null
    }

    const sortedBySum = [...points].sort(
      (a, b) =>
        a.x +
        a.y -
        (b.x + b.y)
    )

    const topLeft =
      sortedBySum[0]

    const bottomRight =
      sortedBySum[3]

    const remaining =
      sortedBySum.slice(1, 3)

    let topRight
    let bottomLeft

    if (
      remaining[0].y <
      remaining[1].y
    ) {
      topRight = remaining[0]
      bottomLeft = remaining[1]
    } else {
      topRight = remaining[1]
      bottomLeft = remaining[0]
    }

    return {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    }
  }

  // =====================================================
  // DETEKSI 4 MARKER HITAM
  //
  // LJK AnswerSheet:
  // marker = 8mm x 8mm
  // posisi = 7mm dari tepi
  // =====================================================

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
    let threshold = null
    let contours = null
    let hierarchy = null

    try {
      src = cv.imread(canvas)

      const imageWidth = src.cols
      const imageHeight = src.rows
      const imageArea =
        imageWidth * imageHeight

      // ==========================================
      // 1. GRAYSCALE
      // ==========================================

      gray = new cv.Mat()

      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      // ==========================================
      // 2. BLUR
      // ==========================================

      blur = new cv.Mat()

      cv.GaussianBlur(
        gray,
        blur,
        new cv.Size(5, 5),
        0
      )

      // ==========================================
      // 3. THRESHOLD PUTIH
      //
      // LJK putih
      // background cokelat/oranye
      // ==========================================

      threshold = new cv.Mat()

      cv.threshold(
        blur,
        threshold,
        180,
        255,
        cv.THRESH_BINARY
      )

      // ==========================================
      // 4. CARI CONTOUR
      // ==========================================

      contours =
        new cv.MatVector()

      hierarchy =
        new cv.Mat()

      cv.findContours(
        threshold,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )

      const candidates = []

      // ==========================================
      // 5. CARI BENTUK KERTAS
      // ==========================================

      for (
        let i = 0;
        i < contours.size();
        i++
      ) {
        const contour =
          contours.get(i)

        const area =
          cv.contourArea(contour)

        // Kertas harus cukup besar
        if (
          area <
          imageArea * 0.10
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

        // Kita butuh 4 sudut
        if (
          approx.rows === 4
        ) {
          const points = []

          for (
            let j = 0;
            j < 4;
            j++
          ) {
            const x =
              approx.intAt(
                j,
                0
              )

            const y =
              approx.intAt(
                j,
                1
              )

            points.push({
              x,
              y,
            })
          }

          // ======================================
          // BOUNDING RECT
          // ======================================

          const rect =
            cv.boundingRect(
              contour
            )

          const width =
            rect.width

          const height =
            rect.height

          if (
            width > 0 &&
            height > 0
          ) {
            const ratio =
              width / height

            /*
            * F4 portrait:
            *
            * 210 / 330
            * ≈ 0.636
            *
            * Karena foto bisa miring,
            * kita beri toleransi cukup besar.
            */

            if (
              ratio >= 0.45 &&
              ratio <= 0.90
            ) {
              candidates.push({
                points,
                area,
                ratio,
              })
            }
          }
        }

        approx.delete()
        contour.delete()
      }

      // ==========================================
      // 6. TIDAK ADA KERTAS
      // ==========================================

      if (
        candidates.length === 0
      ) {
        return {
          detected: false,
          message:
            "❌ LJK belum terdeteksi. Pastikan seluruh kertas terlihat jelas.",
        }
      }

      // ==========================================
      // 7. AMBIL KANDIDAT TERBESAR
      // ==========================================

      candidates.sort(
        (a, b) =>
          b.area - a.area
      )

      const best =
        candidates[0]

      // ==========================================
      // 8. URUTKAN 4 SUDUT
      // ==========================================

      const ordered =
        orderMarkers(
          best.points
        )

      if (!ordered) {
        return {
          detected: false,
          message:
            "❌ Gagal menentukan 4 sudut LJK.",
        }
      }

      console.log(
        "===== KERTAS LJK TERDETEKSI ====="
      )

      console.log(
        "Top Left:",
        ordered.topLeft
      )

      console.log(
        "Top Right:",
        ordered.topRight
      )

      console.log(
        "Bottom Left:",
        ordered.bottomLeft
      )

      console.log(
        "Bottom Right:",
        ordered.bottomRight
      )

      console.log(
        "Area:",
        best.area
      )

      console.log(
        "Rasio:",
        best.ratio
      )

      return {
        detected: true,

        message:
          "✅ LJK berhasil terdeteksi.",

        markers: ordered,
      }
    } catch (error) {
      console.error(
        "ERROR DETEKSI LJK:",
        error
      )

      return {
        detected: false,

        message:
          `❌ Gagal mendeteksi LJK: ${
            error?.message ||
            "error tidak diketahui"
          }`,
      }
    } finally {
      if (src)
        src.delete()

      if (gray)
        gray.delete()

      if (blur)
        blur.delete()

      if (threshold)
        threshold.delete()

      if (contours)
        contours.delete()

      if (hierarchy)
        hierarchy.delete()
    }
  }

  // =====================================================
  // WARP LJK
  //
  // AnswerSheet:
  // F4 = 210mm x 330mm
  // marker center:
  // 7mm + 4mm = 11mm dari tepi
  //
  // 840 x 1320 = 4 pixel/mm
  // =====================================================

  const warpAnswerSheet = (canvas, markers) => {
    if (!window.cv || !window.cv.Mat) {
      return null
    }

    const cv = window.cv

    let src = null
    let dst = null
    let srcTri = null
    let dstTri = null
    let matrix = null

    try {
      src = cv.imread(canvas)

      // Ukuran hasil akhir LJK
      // F4 = 210mm x 330mm
      const outputWidth = 840
      const outputHeight = 1320

      // =================================================
      // 4 SUDUT KERTAS ASLI
      // =================================================

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

      // =================================================
      // HASIL AKHIR
      //
      // Seluruh canvas hanya berisi LJK.
      // Tidak ada background meja.
      // =================================================

      const dstPoints = [
        0,
        0,

        outputWidth,
        0,

        outputWidth,
        outputHeight,

        0,
        outputHeight,
      ]

      srcTri = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        srcPoints
      )

      dstTri = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        dstPoints
      )

      // =================================================
      // PERSPECTIVE TRANSFORM
      // =================================================

      matrix = cv.getPerspectiveTransform(
        srcTri,
        dstTri
      )

      dst = new cv.Mat()

      cv.warpPerspective(
        src,
        dst,
        matrix,
        new cv.Size(
          outputWidth,
          outputHeight
        ),
        cv.INTER_CUBIC,
        cv.BORDER_CONSTANT,
        new cv.Scalar(
          255,
          255,
          255,
          255
        )
      )

      // =================================================
      // CANVAS HASIL
      // HANYA LJK
      // =================================================

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
        "ERROR WARP LJK:",
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
  // KONFIGURASI LAYOUT LJK
  //
  // DIAMBIL LANGSUNG DARI AnswerSheet.jsx
  // =====================================================

  const getSheetLayout = (
    totalQuestions
  ) => {
    const columnCount =
      totalQuestions >= 80
        ? 3
        : 2

    const questionsPerColumn =
      Math.ceil(
        totalQuestions /
          columnCount
      )

    let rowHeightMm = 5.5

    if (
      totalQuestions >= 60
    ) {
      rowHeightMm = 5
    }

    if (
      totalQuestions >= 80
    ) {
      rowHeightMm = 4.8
    }

    const bubbleSizeMm =
      totalQuestions >= 100
        ? 4
        : totalQuestions >= 90
        ? 4.2
        : totalQuestions >= 80
        ? 4.3
        : totalQuestions >= 70
        ? 4.5
        : 5

    /*
     * Posisi awal baris PG.
     *
     * Berdasarkan susunan:
     * header
     * garis kop
     * judul
     * identitas
     * petunjuk
     * heading pilihan ganda
     *
     * Dengan canvas 840x1320
     * = 4 pixel / mm.
     */
    const questionStartYmm = 100

    return {
      columnCount,
      questionsPerColumn,
      rowHeightMm,
      bubbleSizeMm,
      questionStartYmm,
    }
  }

  // =====================================================
  // POSISI BUBBLE A-E
  //
  // DIHITUNG DARI CSS AnswerSheet.jsx
  // =====================================================

  const getBubblePositions = (totalQuestions) => {
    const columnCount =
      totalQuestions >= 80 ? 3 : 2

    const questionsPerColumn = Math.ceil(
      totalQuestions / columnCount
    )

    const rowHeightMm =
      totalQuestions >= 80
        ? 4.8
        : totalQuestions >= 60
        ? 5
        : 5.5

    const bubbleSizeMm =
      totalQuestions >= 100
        ? 4
        : totalQuestions >= 90
        ? 4.2
        : totalQuestions >= 80
        ? 4.3
        : totalQuestions >= 70
        ? 4.5
        : 5

    // =====================================================
    // POSISI KERTAS
    //
    // AnswerSheet:
    // width 210mm
    // padding kiri 15mm
    // padding kanan 15mm
    // =====================================================

    const contentLeft = 15
    const contentWidth = 180

    const columnGap =
      columnCount === 3
        ? 5
        : 10

    const columnWidth =
      (
        contentWidth -
        columnGap *
          (columnCount - 1)
      ) /
      columnCount

    // =====================================================
    // POSISI NOMOR
    // =====================================================

    const numberWidth =
      columnCount === 3
        ? 7
        : 9

    const numberMargin = 1.5

    // =====================================================
    // SLOT A-E
    // =====================================================

    const choiceSlotWidth =
      columnCount === 3
        ? 7.2
        : 10

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    /*
    * -----------------------------------------------------
    * PENTING
    *
    * Bubble dan huruf berada di dalam:
    *
    * display:flex
    * justify-content:center
    * gap:0.6mm / 1mm
    *
    * Jadi kita hitung posisi bubble dari
    * TENGAH isi slot, bukan langsung dari
    * sisi kiri slot.
    * -----------------------------------------------------
    */

    const letterWidth =
      columnCount === 3
        ? 1.8
        : 2

    const gap =
      columnCount === 3
        ? 0.6
        : 1

    const contentWidthInsideSlot =
      bubbleSizeMm +
      gap +
      letterWidth

    const bubbleOffsetInsideSlot =
      (
        choiceSlotWidth -
        contentWidthInsideSlot
      ) /
      2

    const bubbleCenterOffset =
      bubbleOffsetInsideSlot +
      bubbleSizeMm / 2

    // =====================================================
    // POSISI Y
    //
    // Ini kita set lebih dekat dengan layout
    // AnswerSheet.jsx.
    // =====================================================

    const questionStartYmm =
      totalQuestions >= 100
        ? 87
        : totalQuestions >= 90
        ? 87
        : totalQuestions >= 80
        ? 87
        : totalQuestions >= 70
        ? 88
        : totalQuestions >= 60
        ? 89
        : 90

    const positions = []

    for (
      let columnIndex = 0;
      columnIndex < columnCount;
      columnIndex++
    ) {
      const columnStart =
        contentLeft +
        columnIndex *
          (
            columnWidth +
            columnGap
          )

      const firstChoiceStart =
        columnStart +
        numberWidth +
        numberMargin

      const questionCount =
        Math.min(
          questionsPerColumn,
          totalQuestions -
            columnIndex *
              questionsPerColumn
        )

      for (
        let rowIndex = 0;
        rowIndex < questionCount;
        rowIndex++
      ) {
        const questionNumber =
          columnIndex *
            questionsPerColumn +
          rowIndex +
          1

        const y =
          questionStartYmm +
          rowIndex *
            rowHeightMm +
          rowHeightMm / 2

        const choicesPosition = {}

        choices.forEach(
          (choice, choiceIndex) => {
            const slotStart =
              firstChoiceStart +
              choiceIndex *
                choiceSlotWidth

            const bubbleCenter =
              slotStart +
              bubbleCenterOffset

            choicesPosition[
              choice
            ] = bubbleCenter
          }
        )

        positions.push({
          questionNumber,
          columnIndex,
          rowIndex,
          y,
          choices: choicesPosition,
        })
      }
    }

    console.log(
      "===== POSISI OMR ====="
    )

    console.log(
      "Jumlah soal:",
      totalQuestions
    )

    console.log(
      "Kolom:",
      columnCount
    )

    console.log(
      "Soal per kolom:",
      questionsPerColumn
    )

    console.log(
      "Start Y:",
      questionStartYmm,
      "mm"
    )

    console.log(
      "Row:",
      rowHeightMm,
      "mm"
    )

    console.log(
      "Bubble:",
      bubbleSizeMm,
      "mm"
    )

    console.log(
      "Posisi nomor 1:",
      positions[0]
    )

    return positions
  }

  // =====================================================
  // UKUR TINTA BUBBLE
  //
  // Tidak mencari lingkaran.
  // Kita langsung membaca area berdasarkan
  // posisi yang sudah diketahui.
  // =====================================================

  const measureBubbleInk = (
    gray,
    centerX,
    centerY,
    radius
  ) => {
    let dark = 0
    let total = 0

    /*
     * Kita membaca bagian tengah bubble.
     *
     * Border lingkaran sengaja tidak ikut
     * supaya garis bubble tidak dianggap
     * sebagai jawaban.
     */

    const innerRadius =
      radius * 0.55

    const startX =
      Math.floor(
        centerX -
          innerRadius
      )

    const endX =
      Math.ceil(
        centerX +
          innerRadius
      )

    const startY =
      Math.floor(
        centerY -
          innerRadius
      )

    const endY =
      Math.ceil(
        centerY +
          innerRadius
      )

    for (
      let y = startY;
      y <= endY;
      y++
    ) {
      if (
        y < 0 ||
        y >= gray.rows
      ) {
        continue
      }

      for (
        let x = startX;
        x <= endX;
        x++
      ) {
        if (
          x < 0 ||
          x >= gray.cols
        ) {
          continue
        }

        const dx =
          x - centerX

        const dy =
          y - centerY

        if (
          dx * dx +
            dy * dy >
          innerRadius *
            innerRadius
        ) {
          continue
        }

        const value =
          gray.ucharPtr(
            y,
            x
          )[0]

        /*
         * Threshold tinta.
         *
         * Pensil hitam:
         * semakin rendah nilainya.
         */

        if (value < 150) {
          dark++
        }

        total++
      }
    }

    if (!total) {
      return 0
    }

    return dark / total
  }

  // =====================================================
  // BACA JAWABAN
  // =====================================================

  const readStudentAnswers = (canvas, totalQuestions) => {
    if (!window.cv || !window.cv.Mat) {
      return {
        answers: {},
        stats: { answeredCount: 0, emptyCount: 0, doubleCount: 0 },
        debug: "❌ OpenCV belum siap.",
      }
    }

    const cv = window.cv

    let src = null
    let gray = null
    let blur = null
    let circles = null

    try {
      const columnCount = totalQuestions >= 80 ? 3 : 2
      const questionsPerColumn = Math.ceil(totalQuestions / columnCount)
      const choices = ["A", "B", "C", "D", "E"]
      const PX_PER_MM = 4

      // Dimensi LJK
      const pageWidthMm = 210
      const paddingLeftMm = 15
      const paddingRightMm = 15
      const contentWidthMm = pageWidthMm - paddingLeftMm - paddingRightMm
      const columnGapMm = columnCount === 3 ? 5 : 10
      const columnWidthMm = (contentWidthMm - columnGapMm * (columnCount - 1)) / columnCount
      const numberWidthMm = columnCount === 3 ? 7 : 9
      const numberMarginMm = 1.5
      const choiceWidthMm = columnCount === 3 ? 7.2 : 10
      const questionRowHeightMm = totalQuestions >= 80 ? 4.8 : totalQuestions >= 60 ? 5 : 5.5
      const bubbleSizeMm = totalQuestions >= 100 ? 4 : totalQuestions >= 90 ? 4.2 : totalQuestions >= 80 ? 4.3 : totalQuestions >= 70 ? 4.5 : 5

      src = cv.imread(canvas)
      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      blur = new cv.Mat()
      cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0)

      // Deteksi Lingkaran awal untuk anchoring Y
      circles = new cv.Mat()
      cv.HoughCircles(blur, circles, cv.HOUGH_GRADIENT, 1, 8, 80, 12, 3, 12)

      const detectedCircles = []
      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3]
        const y = circles.data32F[i * 3 + 1]
        const r = circles.data32F[i * 3 + 2]

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) continue
        if (r < 3 || r > 12) continue
        if (y < 280 || y > 1150) continue

        detectedCircles.push({ x, y, r })
      }

      // Pre-calculate X Centers
      const bubbleCentersX = []
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        const columnStartMm = paddingLeftMm + columnIndex * (columnWidthMm + columnGapMm)
        const answerStartMm = columnStartMm + numberWidthMm + numberMarginMm
        const gapMm = columnCount === 3 ? 0.6 : 1
        const letterWidthMm = columnCount === 3 ? 1.5 : 2
        const contentInsideMm = bubbleSizeMm + gapMm + letterWidthMm
        const bubbleOffsetMm = (choiceWidthMm - contentInsideMm) / 2
        const bubbleCenterOffsetMm = bubbleOffsetMm + bubbleSizeMm / 2

        for (let choiceIndex = 0; choiceIndex < 5; choiceIndex++) {
          const xMm = answerStartMm + choiceIndex * choiceWidthMm + bubbleCenterOffsetMm
          bubbleCentersX.push({
            columnIndex,
            choiceIndex,
            x: xMm * PX_PER_MM,
          })
        }
      }

      // Tentukan Posisi Y Baris Pertama secara fleksibel
      const firstRowCandidates = []
      for (const expected of bubbleCentersX) {
        const near = detectedCircles.filter(
          (circle) => Math.abs(circle.x - expected.x) < 12 && circle.y > 300 && circle.y < 470
        )
        if (near.length > 0) {
          const smallestY = Math.min(...near.map((c) => c.y))
          firstRowCandidates.push(smallestY)
        }
      }

      let firstRowCenterY = 386
      if (firstRowCandidates.length >= 3) {
        firstRowCandidates.sort((a, b) => a - b)
        firstRowCenterY = firstRowCandidates[Math.floor(firstRowCandidates.length / 2)]
      }

      // Fungsi Pengukuran Tinta menggunakan Adaptive Dynamic Threshold
      const measureInk = (centerX, centerY) => {
        const radius = (bubbleSizeMm * PX_PER_MM) / 2
        const innerRadius = radius * 0.65 // Sedikit diperbesar agar area sampel lebih luas

        const startX = Math.floor(centerX - innerRadius)
        const endX = Math.ceil(centerX + innerRadius)
        const startY = Math.floor(centerY - innerRadius)
        const endY = Math.ceil(centerY + innerRadius)

        let darkPixels = 0
        let totalPixels = 0

        for (let y = startY; y <= endY; y++) {
          if (y < 0 || y >= gray.rows) continue
          for (let x = startX; x <= endX; x++) {
            if (x < 0 || x >= gray.cols) continue

            const dx = x - centerX
            const dy = y - centerY
            if (Math.sqrt(dx * dx + dy * dy) > innerRadius) continue

            const value = gray.ucharPtr(y, x)[0]

            // PERBAIKAN: Threshold disesuaikan (120 cukup akurat memisahkan pensil dari kertas)
            if (value < 120) {
              darkPixels++
            }
            totalPixels++
          }
        }

        return totalPixels === 0 ? 0 : darkPixels / totalPixels
      }

      // Loop Pengolahan Soal
      const answers = {}
      let answeredCount = 0
      let emptyCount = 0
      let doubleCount = 0

      for (let questionIndex = 0; questionIndex < totalQuestions; questionIndex++) {
        const questionNumber = questionIndex + 1
        const columnIndex = Math.floor(questionIndex / questionsPerColumn)
        const rowIndex = questionIndex % questionsPerColumn

        const centerY = firstRowCenterY + rowIndex * questionRowHeightMm * PX_PER_MM
        const columnBubbles = bubbleCentersX.filter((item) => item.columnIndex === columnIndex)

        const inkValues = []
        for (let choiceIndex = 0; choiceIndex < 5; choiceIndex++) {
          const bubble = columnBubbles.find((item) => item.choiceIndex === choiceIndex)
          if (!bubble) {
            inkValues.push(0)
            continue
          }
          inkValues.push(measureInk(bubble.x, centerY))
        }

        // Urutkan nilai tinta dari terbesar
        const sorted = inkValues
          .map((value, index) => ({ value, index }))
          .sort((a, b) => b.value - a.value)

        const highest = sorted[0]?.value || 0
        const second = sorted[1]?.value || 0
        const highestIndex = sorted[0]?.index ?? 0

        // THRESHOLD LOGIC
        const MIN_INK = 0.12 // Minimal 12% terisi hitam agar dianggap diarsir

        if (highest < MIN_INK) {
          // PERBAIKAN 1: Kosong
          answers[questionNumber] = "-"
          emptyCount++
        } else {
          // PERBAIKAN 2: Deteksi Ganda yang Realistis
          // Jika bulatan kedua memiliki rasio kegelapan minimal 10% DAN mendekati 60% dari bulatan tertinggi
          const isDouble = second >= 0.10 && second >= highest * 0.60

          if (isDouble) {
            answers[questionNumber] = "GANDA"
            doubleCount++
          } else {
            // PERBAIKAN 3: Jawaban Valid (Terbaca)
            answers[questionNumber] = choices[highestIndex]
            answeredCount++
          }
        }
      }

      const debug = `📝 OMR Fixed Layout | Kolom: ${columnCount} | Baca: ${answeredCount}/${totalQuestions} | Kosong: ${emptyCount} | Ganda: ${doubleCount}`

      return {
        answers,
        stats: { answeredCount, emptyCount, doubleCount },
        debug,
      }
    } catch (error) {
      console.error("ERROR READ STUDENT ANSWERS:", error)
      return {
        answers: {},
        stats: { answeredCount: 0, emptyCount: 0, doubleCount: 0 },
        debug: `❌ Gagal membaca jawaban: ${error?.message || "error tidak diketahui"}`,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (blur) blur.delete()
      if (circles) circles.delete()
    }
  }

  // =====================================================
  // HANDLE SCAN
  // =====================================================

  const handleScan = async () => {
    if (!videoRef.current) {
      return
    }

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
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

      // ================================================
      // FOTO KAMERA
      // ================================================

      const canvas =
        document.createElement(
          "canvas"
        )

      canvas.width =
        video.videoWidth

      canvas.height =
        video.videoHeight

      const context =
        canvas.getContext(
          "2d",
          {
            willReadFrequently:
              true,
          }
        )

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      )

      // ================================================
      // DETEKSI MARKER
      // ================================================

      setMessage(
        "Mencari 4 marker hitam..."
      )

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

        setPreview(
          canvas.toDataURL(
            "image/jpeg",
            0.9
          )
        )

        setScanning(false)
        return
      }

      // ================================================
      // WARP
      // ================================================

      setMessage(
        "Meluruskan LJK..."
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
          "❌ Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      setPreview(
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )
      )

      // ================================================
      // BACA JAWABAN
      // ================================================

      setMessage(
        "Membaca jawaban siswa..."
      )

      const scanResult =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "HASIL OMR:",
        scanResult
      )

      const detectedAnswers =
        scanResult?.answers ||
        {}

      setStudentAnswers(
        detectedAnswers
      )

      // ================================================
      // KOREKSI
      // ================================================

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
          error?.message ||
          "tidak diketahui"
        }`
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

        {/* DATA UJIAN */}
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

              setPreview(null)
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
                  Kamera akan digunakan untuk memindai lembar jawaban siswa.
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

          {/* HASIL KOREKSI */}
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

              <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">

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
                  className="block w-full object-contain"
                />

              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Correction