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

  // =========================
// DETEKSI 4 MARKER LJK
// =========================

const detectAnswerSheet = (canvas) => {
  if (!window.cv || !window.cv.Mat) {
    return { detected: false, message: "OpenCV belum siap." }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blurred = null
  let edges = null
  let dilated = null
  let contours = null
  let hierarchy = null
  let kernel = null
  let bestContour = null

  try {
    src = cv.imread(canvas)
    const imageWidth = src.cols
    const imageHeight = src.rows
    const imageArea = imageWidth * imageHeight

    // 1. GRAYSCALE
    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // 2. BLUR (supaya teks/bubble di dalam kertas
    //    tidak memecah tepi kertas jadi banyak potongan)
    blurred = new cv.Mat()
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

    // 3. DETEKSI TEPI
    edges = new cv.Mat()
    cv.Canny(blurred, edges, 50, 150)

    // 4. SAMBUNGKAN TEPI YANG TERPUTUS
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7))
    dilated = new cv.Mat()
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2)

    // 5. CARI CONTOUR
    contours = new cv.MatVector()
    hierarchy = new cv.Mat()
    cv.findContours(
      dilated, contours, hierarchy,
      cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE
    )

    // 6. PILIH KONTUR TERBESAR YANG MASUK AKAL
    //    SEBAGAI KERTAS LJK
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)

      // Kertas minimal 20% dari luas foto,
      // tapi tidak mungkin memenuhi 100% foto
      if (area > bestArea && area > imageArea * 0.2 && area < imageArea * 0.95) {
        if (bestContour) bestContour.delete()
        bestContour = contour
        bestArea = area
      } else {
        contour.delete()
      }
    }

    if (!bestContour) {
      return {
        detected: false,
        message:
          "Lembar jawaban tidak terdeteksi. Pastikan seluruh LJK terlihat jelas dan kontras dengan latar belakang meja.",
      }
    }

    // 7. BUNGKUS DENGAN ROTATED RECTANGLE
    //    (tahan terhadap kertas miring / sedikit terlipat)
    const rotatedRect = cv.minAreaRect(bestContour)
    bestContour.delete()
    bestContour = null

    const boxPoints = cv.RotatedRect.points(rotatedRect)
    const pts = [boxPoints[0], boxPoints[1], boxPoints[2], boxPoints[3]]

    // =========================================
    // 8. URUTKAN 4 TITIK
    //    topLeft, topRight, bottomLeft, bottomRight
    //    (toleran terhadap rotasi sedang)
    // =========================================

    const byY = [...pts].sort((a, b) => a.y - b.y)
    const topTwo = [byY[0], byY[1]].sort((a, b) => a.x - b.x)
    const bottomTwo = [byY[2], byY[3]].sort((a, b) => a.x - b.x)

    const topLeft = topTwo[0]
    const topRight = topTwo[1]
    const bottomLeft = bottomTwo[0]
    const bottomRight = bottomTwo[1]

    // 9. VALIDASI BENTUK
    if (
      topLeft.x >= topRight.x ||
      bottomLeft.x >= bottomRight.x ||
      topLeft.y >= bottomLeft.y ||
      topRight.y >= bottomRight.y
    ) {
      return {
        detected: false,
        message:
          "Bentuk lembar jawaban belum terdeteksi dengan benar. Coba foto lebih lurus/rata dan pastikan latar belakang kontras.",
      }
    }

    const markers = {
      topLeft: { x: topLeft.x, y: topLeft.y },
      topRight: { x: topRight.x, y: topRight.y },
      bottomLeft: { x: bottomLeft.x, y: bottomLeft.y },
      bottomRight: { x: bottomRight.x, y: bottomRight.y },
    }

    console.log("================================")
    console.log("SUDUT LJK TERDETEKSI (deteksi tepi kertas)")
    console.log("TOP LEFT:", markers.topLeft)
    console.log("TOP RIGHT:", markers.topRight)
    console.log("BOTTOM LEFT:", markers.bottomLeft)
    console.log("BOTTOM RIGHT:", markers.bottomRight)
    console.log("================================")

    return {
      detected: true,
      message: "Lembar jawaban berhasil terdeteksi! ✅",
      markers,
    }
  } catch (error) {
    console.error("ERROR DETEKSI LJK:", error)
    return { detected: false, message: "Gagal mendeteksi lembar jawaban." }
  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blurred) blurred.delete()
    if (edges) edges.delete()
    if (dilated) dilated.delete()
    if (contours) contours.delete()
    if (hierarchy) hierarchy.delete()
    if (kernel) kernel.delete()
    if (bestContour) bestContour.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
  // =========================

const warpAnswerSheet = (canvas, markers) => {
  const cv = window.cv
  let src = null, dst = null, srcTri = null, dstTri = null, matrix = null

  try {
    src = cv.imread(canvas)
    const width = 900
    const height = 1200

    // Pakai langsung hasil dari detectAnswerSheet, jangan dihitung ulang
    const srcPoints = [
      markers.topLeft.x, markers.topLeft.y,
      markers.topRight.x, markers.topRight.y,
      markers.bottomRight.x, markers.bottomRight.y,
      markers.bottomLeft.x, markers.bottomLeft.y,
    ]

    const dstPoints = [
      0, 0,
      width - 1, 0,
      width - 1, height - 1,
      0, height - 1,
    ]

    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints)
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints)
    matrix = cv.getPerspectiveTransform(srcTri, dstTri)

    dst = new cv.Mat()
    cv.warpPerspective(
      src, dst, matrix,
      new cv.Size(width, height),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )

    const resultCanvas = document.createElement("canvas")
    resultCanvas.width = width
    resultCanvas.height = height
    cv.imshow(resultCanvas, dst)

    return resultCanvas
  } catch (error) {
    console.error("ERROR WARP:", error)
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
// BACA JAWABAN SISWA
// DETEKSI BUBBLE DINAMIS
// + HITUNG KETEBALAN TINTA
// =========================
const readStudentAnswers = (canvas, totalQuestions) => {
  if (!window.cv || !window.cv.Mat) {
    return {
      answers: {},
      debug: "OpenCV belum siap."
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blurred = null
  let circles = null

  try {
    src = cv.imread(canvas)

    // =========================
    // GRAYSCALE
    // =========================
    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    blurred = new cv.Mat()

    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(3, 3),
      0
    )

    // =========================
    // JUMLAH KOLOM
    // =========================
    const columnCount =
      totalQuestions >= 80 ? 3 : 2

    // =========================
    // DETEKSI SEMUA BUBBLE
    // MENGGUNAKAN HOUGH CIRCLES
    // =========================
    circles = new cv.Mat()

    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      9,
      80,
      14,
      5,
      22
    )

    const candidates = []

    for (let i = 0; i < circles.cols; i++) {
      const x = circles.data32F[i * 3]
      const y = circles.data32F[i * 3 + 1]
      const radius = circles.data32F[i * 3 + 2]

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(radius)
      ) {
        continue
      }

      if (radius < 5 || radius > 22) {
        continue
      }

      // Jangan ambil bubble yang terlalu dekat tepi gambar
      if (
        x < 20 ||
        y < 20 ||
        x > gray.cols - 20 ||
        y > gray.rows - 20
      ) {
        continue
      }

      candidates.push({
        x,
        y,
        radius
      })
    }

    // =========================
    // HAPUS DUPLIKAT
    // =========================
    const uniqueBubbles = []

    candidates.forEach((bubble) => {
      const duplicate = uniqueBubbles.some(
        (existing) => {
          const dx = existing.x - bubble.x
          const dy = existing.y - bubble.y

          return Math.sqrt(
            dx * dx + dy * dy
          ) < 8
        }
      )

      if (!duplicate) {
        uniqueBubbles.push(bubble)
      }
    })

    // =========================
    // DEBUG
    // =========================
    if (uniqueBubbles.length === 0) {
      return {
        answers: {},
        debug:
          "❌ Tidak ada bubble terdeteksi. Coba foto lebih dekat dan terang."
      }
    }

    // =========================
    // RATA-RATA RADIUS BUBBLE
    // =========================
    const sortedRadius = uniqueBubbles
      .map((b) => b.radius)
      .sort((a, b) => a - b)

    const medianRadius =
      sortedRadius[
        Math.floor(sortedRadius.length / 2)
      ] || 8

    // =========================
    // KELOMPOKKAN BUBBLE BERDASARKAN X
    //
    // Setiap posisi jawaban:
    // A B C D E
    // punya garis X sendiri.
    // =========================
    const sortedX = [...uniqueBubbles].sort(
      (a, b) => a.x - b.x
    )

    const xGroups = []

    sortedX.forEach((bubble) => {
      let nearestGroup = null

      for (const group of xGroups) {
        if (
          Math.abs(
            group.centerX - bubble.x
          ) < 12
        ) {
          nearestGroup = group
          break
        }
      }

      if (!nearestGroup) {
        nearestGroup = {
          centerX: bubble.x,
          bubbles: []
        }

        xGroups.push(nearestGroup)
      }

      nearestGroup.bubbles.push(bubble)

      nearestGroup.centerX =
        nearestGroup.bubbles.reduce(
          (sum, item) => sum + item.x,
          0
        ) /
        nearestGroup.bubbles.length
    })

    xGroups.sort(
      (a, b) => a.centerX - b.centerX
    )

    // =========================
    // HANYA AMBIL GARIS X
    // YANG CUKUP BANYAK BUBBLE
    // =========================
    const validXGroups =
      xGroups.filter(
        (group) =>
          group.bubbles.length >= 3
      )

    // =========================
    // KALAU TERLALU SEDIKIT
    // =========================
    if (
      validXGroups.length <
      columnCount * 5
    ) {
      return {
        answers: {},
        debug:
          `❌ Bubble terdeteksi ${uniqueBubbles.length}, ` +
          `tetapi posisi A-E belum lengkap. ` +
          `Garis bubble: ${validXGroups.length}, ` +
          `seharusnya minimal ${columnCount * 5}.`
      }
    }

    // =========================
    // CARI PEMISAH ANTAR KOLOM
    // =========================
    const xGaps = []

    for (
      let i = 1;
      i < validXGroups.length;
      i++
    ) {
      xGaps.push({
        index: i,
        gap:
          validXGroups[i].centerX -
          validXGroups[i - 1].centerX
      })
    }

    // Gap terbesar = pemisah antar kolom
    const separatorIndexes = [
      ...xGaps
    ]
      .sort((a, b) => b.gap - a.gap)
      .slice(0, columnCount - 1)
      .map((item) => item.index)
      .sort((a, b) => a - b)

    // =========================
    // BENTUKKAN KOLOM
    // =========================
    const columnGroups =
      Array.from(
        { length: columnCount },
        () => []
      )

    let currentColumn = 0

    validXGroups.forEach(
      (group, index) => {
        if (
          separatorIndexes.includes(index)
        ) {
          currentColumn++
        }

        if (
          currentColumn < columnCount
        ) {
          columnGroups[currentColumn].push(
            group
          )
        }
      }
    )

    // =========================
    // SETIAP KOLOM HARUS PUNYA
    // 5 POSISI A-E
    // =========================
    const finalColumns =
      columnGroups.map((groups) => {
        if (groups.length === 5) {
          return groups
        }

        // Kalau lebih dari 5,
        // ambil 5 group dengan bubble terbanyak
        if (groups.length > 5) {
          return [...groups]
            .sort(
              (a, b) =>
                b.bubbles.length -
                a.bubbles.length
            )
            .slice(0, 5)
            .sort(
              (a, b) =>
                a.centerX -
                b.centerX
            )
        }

        return groups
      })

    // =========================
    // JUMLAH SOAL PER KOLOM
    // =========================
    const base =
      Math.floor(
        totalQuestions /
          columnCount
      )

    const remainder =
      totalQuestions %
      columnCount

    const rowsPerColumn = []

    for (
      let i = 0;
      i < columnCount;
      i++
    ) {
      rowsPerColumn.push(
        i < remainder
          ? base + 1
          : base
      )
    }

    // =========================
    // HITUNG TINTA
    // =========================
    const calculateInk = (
      centerX,
      centerY
    ) => {
      const radius =
        Math.max(
          3,
          medianRadius * 0.58
        )

      const startX = Math.floor(
        centerX - radius
      )

      const endX = Math.ceil(
        centerX + radius
      )

      const startY = Math.floor(
        centerY - radius
      )

      const endY = Math.ceil(
        centerY + radius
      )

      let darkPixels = 0
      let totalPixels = 0

      const radiusSquared =
        radius * radius

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
            radiusSquared
          ) {
            continue
          }

          const value =
            gray.ucharPtr(
              y,
              x
            )[0]

          // tinta hitam
          if (value < 150) {
            darkPixels++
          }

          totalPixels++
        }
      }

      if (
        totalPixels === 0
      ) {
        return 0
      }

      return (
        darkPixels /
        totalPixels
      )
    }

    // =========================
    // HASIL JAWABAN
    // =========================
    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E"
    ]

    const answers = {}

    let globalQuestion = 1

    let totalRowsDetected = 0
    let answeredCount = 0

    // =========================
    // PROSES SETIAP KOLOM
    // =========================
    finalColumns.forEach(
      (
        column,
        columnIndex
      ) => {
        if (
          column.length !== 5
        ) {
          console.warn(
            `Kolom ${
              columnIndex + 1
            } tidak memiliki 5 garis.`
          )

          return
        }

        // =========================
        // AMBIL SEMUA BUBBLE
        // DARI 5 TRACK A-E
        // =========================
        const columnBubbles = []

        column.forEach(
          (group) => {
            group.bubbles.forEach(
              (bubble) => {
                columnBubbles.push(
                  bubble
                )
              }
            )
          }
        )

        // =========================
        // KELOMPOKKAN BERDASARKAN Y
        // =========================
        const rows = []

        const rowTolerance =
          Math.max(
            4,
            Math.min(
              7,
              medianRadius * 0.8
            )
          )

        columnBubbles
          .sort(
            (a, b) =>
              a.y - b.y
          )
          .forEach(
            (bubble) => {
              let row = null

              for (
                const existing of rows
              ) {
                if (
                  Math.abs(
                    existing.centerY -
                      bubble.y
                  ) <
                  rowTolerance
                ) {
                  row = existing
                  break
                }
              }

              if (!row) {
                row = {
                  centerY:
                    bubble.y,
                  bubbles: []
                }

                rows.push(row)
              }

              row.bubbles.push(
                bubble
              )

              row.centerY =
                row.bubbles.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum + item.y,
                  0
                ) /
                row.bubbles.length
            }
          )

        rows.sort(
          (a, b) =>
            a.centerY -
            b.centerY
        )

        // =========================
        // VALIDASI ROW
        // ROW ASLI HARUS MENYEBAR
        // KE 5 POSISI A-E
        // =========================
        const validRows =
          rows.filter(
            (row) => {
              let matched = 0

              column.forEach(
                (group) => {
                  const found =
                    row.bubbles.some(
                      (bubble) =>
                        Math.abs(
                          bubble.x -
                            group.centerX
                        ) < 12
                    )

                  if (found) {
                    matched++
                  }
                }
              )

              return matched >= 3
            }
          )

        totalRowsDetected +=
          validRows.length

        // =========================
        // BATASI SESUAI JUMLAH SOAL
        // =========================
        const usableRows =
          validRows.slice(
            0,
            rowsPerColumn[
              columnIndex
            ]
          )

        // =========================
        // PROSES SETIAP SOAL
        // =========================
        usableRows.forEach(
          (row) => {
            const inkValues =
              column.map(
                (group) => {
                  // Cari bubble aktual
                  // terdekat dengan posisi track
                  const matching =
                    row.bubbles.filter(
                      (bubble) =>
                        Math.abs(
                          bubble.x -
                            group.centerX
                        ) < 12
                    )

                  if (
                    matching.length > 0
                  ) {
                    const best =
                      matching.sort(
                        (a, b) =>
                          Math.abs(
                            a.x -
                              group.centerX
                          ) -
                          Math.abs(
                            b.x -
                              group.centerX
                          )
                      )[0]

                    return calculateInk(
                      best.x,
                      best.y
                    )
                  }

                  // Kalau bubble tidak
                  // berhasil terdeteksi,
                  // tetap gunakan posisi
                  // track + center row
                  return calculateInk(
                    group.centerX,
                    row.centerY
                  )
                }
              )

            console.log(
              `SOAL ${globalQuestion} - TINTA:`,
              inkValues.map(
                (value) =>
                  Number(
                    value.toFixed(3)
                  )
              )
            )

            // =========================
            // CARI TINTA PALING TEBAL
            // =========================
            let highestIndex = 0

            for (
              let i = 1;
              i <
              inkValues.length;
              i++
            ) {
              if (
                inkValues[i] >
                inkValues[
                  highestIndex
                ]
              ) {
                highestIndex =
                  i
              }
            }

            const highest =
              inkValues[
                highestIndex
              ]

            const sortedInk =
              [...inkValues].sort(
                (a, b) =>
                  b - a
              )

            const second =
              sortedInk[1] || 0

            // =========================
            // TENTUKAN JAWABAN
            // =========================

            // Benar-benar kosong
            if (
              highest < 0.08
            ) {
              answers[
                globalQuestion
              ] = ""
            }

            // Dua pilihan sama-sama
            // tebal → dianggap double
            else if (
              second >
              highest * 0.78 &&
              highest > 0.15
            ) {
              answers[
                globalQuestion
              ] = ""
            }

            // Ambil tinta paling tebal
            else {
              answers[
                globalQuestion
              ] =
                choices[
                  highestIndex
                ]

              answeredCount++
            }

            globalQuestion++
          }
        )
      }
    )

    // =========================
    // DEBUG YANG DITAMPILKAN DI HP
    // =========================
    const columnDebug =
      finalColumns
        .map(
          (column) =>
            column.length
        )
        .join(" / ")

    const debug =
      `🔍 Bubble: ${uniqueBubbles.length}` +
      ` | Track: ${validXGroups.length}` +
      ` | Kolom: ${columnDebug}` +
      ` | Baris: ${totalRowsDetected}` +
      ` | Terbaca: ${answeredCount}/${totalQuestions}`

    console.log(
      "=============================="
    )

    console.log(
      "BUBBLE:",
      uniqueBubbles.length
    )

    console.log(
      "X GROUP:",
      validXGroups.map(
        (g) =>
          Math.round(
            g.centerX
          )
      )
    )

    console.log(
      "KOLOM:",
      finalColumns.map(
        (column) =>
          column.map(
            (g) =>
              Math.round(
                g.centerX
              )
          )
      )
    )

    console.log(
      "HASIL:",
      answers
    )

    console.log(
      "=============================="
    )

    return {
      answers,
      debug
    }

  } catch (error) {
    console.error(
      "ERROR MEMBACA JAWABAN:",
      error
    )

    return {
      answers: {},
      debug:
        `❌ Gagal membaca jawaban: ${
          error?.message ||
          "error tidak diketahui"
        }`
    }

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blurred) blurred.delete()
    if (circles) circles.delete()
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
        scanResult.answers || {}

      setStudentAnswers(
        detectedAnswers
      )

      // Tampilkan debug di HP
      setMessage(
        scanResult.debug
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
        `${scanResult.debug} | Koreksi selesai! 🎉`
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
                  onClick={(e) => {
                    const img = e.currentTarget
                    const rect = img.getBoundingClientRect()

                    const x =
                      Math.round(
                        ((e.clientX - rect.left) / rect.width) *
                          img.naturalWidth
                      )

                    const y =
                      Math.round(
                        ((e.clientY - rect.top) / rect.height) *
                          img.naturalHeight
                      )

                    setCalibratePoint({
                      x,
                      y
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