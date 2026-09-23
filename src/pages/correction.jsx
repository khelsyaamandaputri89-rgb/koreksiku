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
    let threshold = null
    let contours = null
    let hierarchy = null

    try {
      src = cv.imread(canvas)

      const width = src.cols
      const height = src.rows

      // ================================================
      // GRAYSCALE
      // ================================================

      gray = new cv.Mat()

      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      // ================================================
      // THRESHOLD HITAM
      // ================================================

      threshold = new cv.Mat()

      cv.threshold(
        gray,
        threshold,
        100,
        255,
        cv.THRESH_BINARY_INV
      )

      // ================================================
      // CARI CONTOUR
      // ================================================

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

      for (
        let i = 0;
        i < contours.size();
        i++
      ) {
        const contour =
          contours.get(i)

        const area =
          cv.contourArea(contour)

        if (area < 80) {
          contour.delete()
          continue
        }

        const rect =
          cv.boundingRect(contour)

        const rectWidth =
          rect.width

        const rectHeight =
          rect.height

        if (
          rectWidth < 8 ||
          rectHeight < 8
        ) {
          contour.delete()
          continue
        }

        const ratio =
          rectWidth /
          rectHeight

        // Marker berbentuk hampir kotak
        if (
          ratio < 0.65 ||
          ratio > 1.35
        ) {
          contour.delete()
          continue
        }

        const contourArea =
          Math.max(area, 1)

        const rectangleArea =
          rectWidth *
          rectHeight

        const fillRatio =
          contourArea /
          rectangleArea

        // Marker hitam harus cukup padat
        if (fillRatio < 0.55) {
          contour.delete()
          continue
        }

        const center = {
          x:
            rect.x +
            rect.width / 2,

          y:
            rect.y +
            rect.height / 2,
        }

        // ==============================================
        // UKURAN RELATIF MARKER
        // ==============================================

        const relativeWidth =
          rectWidth / width

        const relativeHeight =
          rectHeight / height

        // Marker terlalu kecil biasanya noise
        if (
          relativeWidth < 0.005 ||
          relativeHeight < 0.005
        ) {
          contour.delete()
          continue
        }

        // Marker terlalu besar kemungkinan bukan marker
        if (
          relativeWidth > 0.15 ||
          relativeHeight > 0.15
        ) {
          contour.delete()
          continue
        }

        candidates.push({
          center,
          width: rectWidth,
          height: rectHeight,
          area,
          fillRatio,
        })

        contour.delete()
      }

      if (candidates.length < 4) {
        return {
          detected: false,
          message:
            "❌ 4 marker hitam belum ditemukan. Pastikan keempat marker terlihat jelas.",
        }
      }

      // =================================================
      // CARI KOMBINASI 4 MARKER
      //
      // Tidak langsung mengambil 4 terbesar.
      // Kita mencari kombinasi yang bentuknya
      // paling mirip persegi panjang.
      // =================================================

      let bestGroup = null
      let bestScore = -Infinity

      const maxCandidates =
        Math.min(
          candidates.length,
          30
        )

      const limitedCandidates =
        [...candidates]
          .sort(
            (a, b) =>
              b.area - a.area
          )
          .slice(
            0,
            maxCandidates
          )

      for (
        let a = 0;
        a < limitedCandidates.length;
        a++
      ) {
        for (
          let b = a + 1;
          b < limitedCandidates.length;
          b++
        ) {
          for (
            let c = b + 1;
            c < limitedCandidates.length;
            c++
          ) {
            for (
              let d = c + 1;
              d < limitedCandidates.length;
              d++
            ) {
              const group = [
                limitedCandidates[a],
                limitedCandidates[b],
                limitedCandidates[c],
                limitedCandidates[d],
              ]

              const ordered =
                orderMarkers(
                  group.map(
                    (item) =>
                      item.center
                  )
                )

              if (!ordered) {
                continue
              }

              const widthTop =
                distance(
                  ordered.topLeft,
                  ordered.topRight
                )

              const widthBottom =
                distance(
                  ordered.bottomLeft,
                  ordered.bottomRight
                )

              const heightLeft =
                distance(
                  ordered.topLeft,
                  ordered.bottomLeft
                )

              const heightRight =
                distance(
                  ordered.topRight,
                  ordered.bottomRight
                )

              if (
                widthTop < 50 ||
                widthBottom < 50 ||
                heightLeft < 80 ||
                heightRight < 80
              ) {
                continue
              }

              const avgWidth =
                (widthTop +
                  widthBottom) /
                2

              const avgHeight =
                (heightLeft +
                  heightRight) /
                2

              const ratio =
                avgWidth /
                avgHeight

              // F4 portrait = 210 / 330
              const f4Ratio =
                210 / 330

              const ratioError =
                Math.abs(
                  ratio -
                    f4Ratio
                )

              if (
                ratioError > 0.25
              ) {
                continue
              }

              // Ukuran marker relatif harus mirip
              const markerWidths =
                group.map(
                  (item) =>
                    item.width
                )

              const averageMarkerWidth =
                markerWidths.reduce(
                  (sum, value) =>
                    sum + value,
                  0
                ) /
                markerWidths.length

              const markerSizeError =
                group.reduce(
                  (sum, item) =>
                    sum +
                    Math.abs(
                      item.width -
                        averageMarkerWidth
                    ),
                  0
                ) /
                group.length

              const markerSizeScore =
                Math.max(
                  0,
                  1 -
                    markerSizeError /
                      Math.max(
                        averageMarkerWidth,
                        1
                      )
                )

              // Kedekatan ratio
              const ratioScore =
                Math.max(
                  0,
                  1 -
                    ratioError /
                      0.25
                )

              // Keempat marker harus membentuk
              // kertas yang cukup besar
              const sizeScore =
                Math.min(
                  avgHeight /
                    (height *
                      0.45),
                  1
                )

              const score =
                ratioScore * 0.55 +
                markerSizeScore *
                  0.25 +
                sizeScore * 0.20

              if (
                score >
                bestScore
              ) {
                bestScore = score

                bestGroup =
                  ordered
              }
            }
          }
        }
      }

      if (!bestGroup) {
        return {
          detected: false,
          message:
            "❌ Marker hitam belum dapat dipastikan. Pastikan seluruh LJK terlihat.",
        }
      }

      console.log(
        "===== MARKER LJK ====="
      )

      console.log(
        "TL:",
        bestGroup.topLeft
      )

      console.log(
        "TR:",
        bestGroup.topRight
      )

      console.log(
        "BL:",
        bestGroup.bottomLeft
      )

      console.log(
        "BR:",
        bestGroup.bottomRight
      )

      console.log(
        "Score:",
        bestScore
      )

      return {
        detected: true,
        message:
          "✅ 4 marker LJK berhasil ditemukan.",
        markers: bestGroup,
      }
    } catch (error) {
      console.error(
        "ERROR DETEKSI MARKER:",
        error
      )

      return {
        detected: false,
        message:
          `❌ Gagal mendeteksi marker: ${
            error?.message ||
            "error tidak diketahui"
          }`,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
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

  const warpAnswerSheet = (
    canvas,
    markers
  ) => {
    if (
      !window.cv ||
      !window.cv.Mat
    ) {
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

      const width = 840
      const height = 1320

      // Marker center = 11mm dari tepi
      const markerOffset = 44

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

      const dstPoints = [
        markerOffset,
        markerOffset,

        width -
          markerOffset,
        markerOffset,

        width -
          markerOffset,
        height -
          markerOffset,

        markerOffset,
        height -
          markerOffset,
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

  const getBubblePositions = (
    totalQuestions
  ) => {
    const layout =
      getSheetLayout(
        totalQuestions
      )

    const {
      columnCount,
    } = layout

    const positions = []

    /*
     * Kertas:
     * width 210mm
     * padding kiri/kanan 15mm
     *
     * Area isi = 180mm
     */

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

    /*
     * AnswerSheet.jsx:
     *
     * 2 kolom:
     * nomor = 9mm
     *
     * 3 kolom:
     * nomor = 7mm
     */

    const numberWidth =
      columnCount === 3
        ? 7
        : 9

    /*
     * Margin kanan nomor
     */
    const numberMargin =
      1.5

    /*
     * Lebar setiap pilihan:
     *
     * 2 kolom = 10mm
     * 3 kolom = 7.2mm
     */

    const choiceWidth =
      columnCount === 3
        ? 7.2
        : 10

    /*
     * Bubble center:
     *
     * 2 kolom:
     * bubble = 5mm
     *
     * 3 kolom:
     * bubble = 4.3mm
     */

    const bubbleSize =
      columnCount === 3
        ? 4.3
        : totalQuestions >= 100
        ? 4
        : totalQuestions >= 90
        ? 4.2
        : totalQuestions >= 80
        ? 4.3
        : totalQuestions >= 70
        ? 4.5
        : 5

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    for (
      let columnIndex = 0;
      columnIndex <
      columnCount;
      columnIndex++
    ) {
      const columnStart =
        contentLeft +
        columnIndex *
          (columnWidth +
            columnGap)

      /*
       * Posisi awal A
       */
      const firstBubbleCenter =
        columnStart +
        numberWidth +
        numberMargin +
        bubbleSize / 2

      const questionCount =
        Math.min(
          layout.questionsPerColumn,
          totalQuestions -
            columnIndex *
              layout.questionsPerColumn
        )

      for (
        let rowIndex = 0;
        rowIndex <
        questionCount;
        rowIndex++
      ) {
        const questionNumber =
          columnIndex *
            layout.questionsPerColumn +
          rowIndex +
          1

        const y =
          layout.questionStartYmm +
          layout.rowHeightMm *
            rowIndex +
          layout.rowHeightMm /
            2

        const choicesPosition = {}

        choices.forEach(
          (
            choice,
            choiceIndex
          ) => {
            choicesPosition[
              choice
            ] =
              firstBubbleCenter +
              choiceIndex *
                choiceWidth
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
        debug:
          "❌ OpenCV belum siap.",
      }
    }

    const cv = window.cv

    let source = null
    let gray = null
    let blur = null

    try {
      const layout =
        getSheetLayout(
          totalQuestions
        )

      const positions =
        getBubblePositions(
          totalQuestions
        )

      console.log(
        "===== LAYOUT OMR ====="
      )

      console.log(
        "Jumlah soal:",
        totalQuestions
      )

      console.log(
        "Kolom:",
        layout.columnCount
      )

      console.log(
        "Soal per kolom:",
        layout.questionsPerColumn
      )

      console.log(
        "Tinggi baris:",
        layout.rowHeightMm,
        "mm"
      )

      source =
        cv.imread(canvas)

      gray = new cv.Mat()

      cv.cvtColor(
        source,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      blur = new cv.Mat()

      cv.GaussianBlur(
        gray,
        blur,
        new cv.Size(3, 3),
        0
      )

      const answers = {}

      let answeredCount = 0
      let emptyCount = 0
      let doubleCount = 0

      const debugData = []

      /*
       * 840 x 1320
       * 4 pixel = 1mm
       */

      const pxPerMmX =
        canvas.width / 210

      const pxPerMmY =
        canvas.height / 330

      for (
        const position of positions
      ) {
        const centerY =
          position.y *
          pxPerMmY

        const inkValues = []

        const choices = [
          "A",
          "B",
          "C",
          "D",
          "E",
        ]

        choices.forEach(
          (choice) => {
            const centerX =
              position.choices[
                choice
              ] *
              pxPerMmX

            /*
             * Bubble ukuran mengikuti
             * AnswerSheet.jsx.
             *
             * Untuk membaca isi,
             * gunakan radius sekitar 1.45mm.
             */

            const radius =
              Math.max(
                5,
                (
                  layout.bubbleSizeMm *
                  0.29
                ) *
                  pxPerMmX
              )

            const ink =
              measureBubbleInk(
                gray,
                centerX,
                centerY,
                radius
              )

            inkValues.push(
              ink
            )
          }
        )

        /*
         * Urutkan tingkat kehitaman
         */

        const indexed =
          inkValues
            .map(
              (
                value,
                index
              ) => ({
                value,
                index,
              })
            )
            .sort(
              (a, b) =>
                b.value -
                a.value
            )

        const highest =
          indexed[0]?.value || 0

        const second =
          indexed[1]?.value || 0

        /*
         * Threshold kosong.
         *
         * Karena border bubble tidak
         * dibaca, nilai kosong harus
         * rendah.
         */

        const EMPTY_THRESHOLD =
          0.12

        /*
         * Kalau nilai tertinggi rendah,
         * berarti kosong.
         */

        if (
          highest <
          EMPTY_THRESHOLD
        ) {
          answers[
            position.questionNumber
          ] = ""

          emptyCount++

          debugData.push({
            number:
              position.questionNumber,
            ink:
              inkValues.map(
                (value) =>
                  Number(
                    value.toFixed(
                      3
                    )
                  )
              ),
            answer: "",
          })

          continue
        }

        /*
         * Kalau dua pilihan hampir sama
         * gelap, kemungkinan siswa
         * menghitamkan dua pilihan.
         */

        const isDouble =
          second >
            EMPTY_THRESHOLD &&
          second >=
            highest * 0.82

        if (isDouble) {
          answers[
            position.questionNumber
          ] = ""

          doubleCount++

          debugData.push({
            number:
              position.questionNumber,
            ink:
              inkValues.map(
                (value) =>
                  Number(
                    value.toFixed(
                      3
                    )
                  )
              ),
            answer:
              "GANDA",
          })

          continue
        }

        const answer =
          choices[
            indexed[0].index
          ]

        answers[
          position.questionNumber
        ] = answer

        answeredCount++

        debugData.push({
          number:
            position.questionNumber,
          ink:
            inkValues.map(
              (value) =>
                Number(
                  value.toFixed(
                    3
                  )
                )
            ),
          answer,
        })
      }

      console.log(
        "===== HASIL PEMBACAAN ====="
      )

      console.table(
        debugData
      )

      const debug =
        `📝 OMR Fixed Layout` +
        ` | Kolom: ${layout.columnCount}` +
        ` | Baca: ${answeredCount}/${totalQuestions}` +
        ` | Kosong: ${emptyCount}` +
        ` | Ganda: ${doubleCount}`

      console.log(
        "DEBUG:",
        debug
      )

      console.log(
        "JAWABAN:",
        answers
      )

      return {
        answers,
        debug,
      }
    } catch (error) {
      console.error(
        "ERROR READ OMR:",
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
      if (source)
        source.delete()

      if (gray)
        gray.delete()

      if (blur)
        blur.delete()
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