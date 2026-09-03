import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

function AnswerSheet() {
  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState("")
  const [answerKeys, setAnswerKeys] = useState([])

  const [template, setTemplate] = useState("45-5")
  const [printMode, setPrintMode] = useState("")

  const [schoolName, setSchoolName] = useState(
    "SMK ISLAM AL AMANAH"
  )

  const [schoolAddress, setSchoolAddress] = useState(
    "JL. KAUMAN BARAT"
  )

  const [isPrinting, setIsPrinting] = useState(false)

  useEffect(() => {
    fetchExams()
  }, [])

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
      console.error(error)
      return
    }

    setExams(data || [])
  }

  // =====================================================
  // AMBIL KUNCI JAWABAN
  // =====================================================

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
      .order("question_number", {
        ascending: true,
      })

    if (error) {
      console.error(error)
      return
    }

    setAnswerKeys(data || [])
  }

  // =====================================================
  // CETAK F4
  // =====================================================

  const handlePrint = () => {
    setIsPrinting(true)

    // Membuat aturan print F4 secara otomatis
    const printStyle = document.createElement("style")

    printStyle.id = "answer-sheet-print-style"

    printStyle.innerHTML = `
      @page {
        size: 210mm 330mm;
        margin: 0;
      }

      @media print {
        html,
        body {
          width: 210mm !important;
          height: 330mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }

        body * {
          visibility: hidden;
        }

        #answer-sheet-print,
        #answer-sheet-print * {
          visibility: visible;
        }

        #answer-sheet-print {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          height: 330mm !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
      }
    `

    document.head.appendChild(printStyle)

    setTimeout(() => {
      window.print()

      setTimeout(() => {
        const style =
          document.getElementById(
            "answer-sheet-print-style"
          )

        if (style) {
          style.remove()
        }

        setIsPrinting(false)
      }, 500)
    }, 300)
  }

  // =====================================================
  // JUMLAH SOAL
  // =====================================================

  const [multipleChoiceCount, essayCount] =
    template.split("-").map(Number)

  // =====================================================
  // NOMOR SOAL
  // =====================================================

  const multipleChoiceQuestions = Array.from(
    {
      length: multipleChoiceCount,
    },
    (_, index) => index + 1
  )

  // =====================================================
  // JUMLAH KOLOM OTOMATIS
  //
  // 40–70 = 2 kolom
  // 80–100 = 3 kolom
  // =====================================================

  const columnCount =
    multipleChoiceCount >= 80
      ? 3
      : 2

  // =====================================================
  // BAGI SOAL KE KOLOM
  // =====================================================

  const questionsPerColumn = Math.ceil(
    multipleChoiceCount /
      columnCount
  )

  const columns = Array.from(
    {
      length: columnCount,
    },
    (_, index) =>
      multipleChoiceQuestions.slice(
        index * questionsPerColumn,
        (index + 1) *
          questionsPerColumn
      )
  )

  // =====================================================
  // UKURAN BARIS PG
  // SEMAKIN BANYAK SOAL -> SEMAKIN RAPAT
  // =====================================================

  const questionRowHeight =
    multipleChoiceCount >= 100
      ? "4mm"
      : multipleChoiceCount >= 90
      ? "4.2mm"
      : multipleChoiceCount >= 80
      ? "4.5mm"
      : multipleChoiceCount >= 70
      ? "4.8mm"
      : multipleChoiceCount >= 60
      ? "5mm"
      : "5.5mm"

  // =====================================================
  // UKURAN BUBBLE
  // =====================================================

  const bubbleSize =
    multipleChoiceCount >= 100
      ? "4mm"
      : multipleChoiceCount >= 90
      ? "4.2mm"
      : multipleChoiceCount >= 80
      ? "4.3mm"
      : multipleChoiceCount >= 70
      ? "4.5mm"
      : "5mm"

  // =====================================================
  // ESSAY
  //
  // Jumlah garis menyesuaikan banyak soal.
  // Tidak menggunakan essayQuestions.
  // =====================================================

  const essayLineCount =
    multipleChoiceCount <= 45
      ? 22
      : multipleChoiceCount <= 50
      ? 19
      : multipleChoiceCount <= 60
      ? 15
      : multipleChoiceCount <= 70
      ? 11
      : multipleChoiceCount <= 80
      ? 8
      : multipleChoiceCount <= 90
      ? 6
      : 5

  // =====================================================
  // TINGGI GARIS ESSAY
  // =====================================================

  const essayLineHeight =
    multipleChoiceCount <= 50
      ? "6mm"
      : multipleChoiceCount <= 60
      ? "5mm"
      : multipleChoiceCount <= 70
      ? "5mm"
      : multipleChoiceCount <= 80
      ? "4.5mm"
      : multipleChoiceCount <= 90
      ? "4mm"
      : "3.8mm"

  // =====================================================
  // BOLEH TAMPIL
  // =====================================================

  const canShowSheet =
    printMode === "tu" ||
    (printMode === "guru" &&
      selectedExam)

  return (
    <div
      style={{
        minHeight: isPrinting
          ? "330mm"
          : "100vh",

        backgroundColor: isPrinting
          ? "#ffffff"
          : "#f3f4f6",

        padding: isPrinting
          ? "0"
          : "24px",

        fontFamily:
          "Arial, sans-serif",
      }}
    >

      {/* =====================================================
          PANEL PENGATURAN
      ====================================================== */}

      {!isPrinting && (
        <div
          style={{
            width: "100%",
            maxWidth: "900px",
            margin:
              "0 auto 24px auto",
            backgroundColor:
              "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            boxShadow:
              "0 4px 15px rgba(0,0,0,0.08)",
          }}
        >

          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              fontWeight: "700",
              color: "#1e293b",
            }}
          >
            Cetak Lembar Jawaban
          </h1>

          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              fontSize: "15px",
              color: "#64748b",
            }}
          >
            Pilih kebutuhan cetak lembar jawaban.
          </p>

          {/* =================================================
              PILIH KEBUTUHAN
          ================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "16px",
              marginTop: "24px",
            }}
          >

            {/* TU */}

            <button
              type="button"
              onClick={() => {
                setPrintMode("tu")
                setSelectedExam("")
                setAnswerKeys([])
              }}
              style={{
                padding: "20px",
                textAlign: "left",
                borderRadius: "16px",
                border:
                  printMode === "tu"
                    ? "2px solid #1e293b"
                    : "2px solid #e5e7eb",
                backgroundColor:
                  printMode === "tu"
                    ? "#f8fafc"
                    : "#ffffff",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: "32px",
                }}
              >
                🧑‍💼
              </div>

              <h2
                style={{
                  marginTop: "10px",
                  marginBottom: "5px",
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#1e293b",
                }}
              >
                Lembar Jawaban untuk TU
              </h2>

              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                Cetak LJK kosong tanpa memilih ujian.
              </p>
            </button>

            {/* GURU */}

            <button
              type="button"
              onClick={() => {
                setPrintMode("guru")
              }}
              style={{
                padding: "20px",
                textAlign: "left",
                borderRadius: "16px",
                border:
                  printMode === "guru"
                    ? "2px solid #1e293b"
                    : "2px solid #e5e7eb",
                backgroundColor:
                  printMode === "guru"
                    ? "#f8fafc"
                    : "#ffffff",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: "32px",
                }}
              >
                👨‍🏫
              </div>

              <h2
                style={{
                  marginTop: "10px",
                  marginBottom: "5px",
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#1e293b",
                }}
              >
                Lembar Jawaban untuk Guru
              </h2>

              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                Pilih ujian untuk membuat lembar jawaban.
              </p>
            </button>

          </div>

          {/* =================================================
              PENGATURAN
          ================================================== */}

          {printMode && (
            <div
              style={{
                marginTop: "24px",
              }}
            >

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#334155",
                }}
              >
                Jenis Lembar Jawaban
              </label>

              <select
                value={template}
                onChange={(e) =>
                  setTemplate(
                    e.target.value
                  )
                }
                style={{
                  width: "100%",
                  padding:
                    "13px 16px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius: "12px",
                  backgroundColor:
                    "#ffffff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing:
                    "border-box",
                }}
              >
                <option value="45-5">
                  Pilgan 45 + Essay 5
                </option>

                <option value="50-5">
                  Pilgan 50 + Essay 5
                </option>

                <option value="60-5">
                  Pilgan 60 + Essay 5
                </option>

                <option value="70-5">
                  Pilgan 70 + Essay 5
                </option>

                <option value="80-5">
                  Pilgan 80 + Essay 5
                </option>

                <option value="90-5">
                  Pilgan 90 + Essay 5
                </option>

                <option value="100-5">
                  Pilgan 100 + Essay 5
                </option>

                <option value="40-0">
                  Full Pilgan 40
                </option>

                <option value="50-0">
                  Full Pilgan 50
                </option>

                <option value="60-0">
                  Full Pilgan 60
                </option>

                <option value="80-0">
                  Full Pilgan 80
                </option>

                <option value="100-0">
                  Full Pilgan 100
                </option>
              </select>

              {/* DATA SEKOLAH */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: "16px",
                  marginTop: "20px",
                }}
              >

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "600",
                      color: "#334155",
                    }}
                  >
                    Nama Sekolah
                  </label>

                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) =>
                      setSchoolName(
                        e.target.value
                      )
                    }
                    style={{
                      width: "100%",
                      padding:
                        "13px 16px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius: "12px",
                      fontSize: "15px",
                      outline: "none",
                      boxSizing:
                        "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "600",
                      color: "#334155",
                    }}
                  >
                    Alamat Sekolah
                  </label>

                  <input
                    type="text"
                    value={schoolAddress}
                    onChange={(e) =>
                      setSchoolAddress(
                        e.target.value
                      )
                    }
                    style={{
                      width: "100%",
                      padding:
                        "13px 16px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius: "12px",
                      fontSize: "15px",
                      outline: "none",
                      boxSizing:
                        "border-box",
                    }}
                  />
                </div>

              </div>

              {/* PILIH UJIAN */}

              {printMode === "guru" && (
                <div
                  style={{
                    marginTop: "20px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "600",
                      color: "#334155",
                    }}
                  >
                    Pilih Ujian
                  </label>

                  <select
                    value={selectedExam}
                    onChange={(e) =>
                      handleExamChange(
                        e.target.value
                      )
                    }
                    style={{
                      width: "100%",
                      padding:
                        "13px 16px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius: "12px",
                      backgroundColor:
                        "#ffffff",
                      fontSize: "15px",
                      outline: "none",
                      boxSizing:
                        "border-box",
                    }}
                  >
                    <option value="">
                      -- Pilih Ujian --
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
              )}

              {/* TOMBOL CETAK */}

              <button
                onClick={handlePrint}
                disabled={
                  printMode === "guru" &&
                  !selectedExam
                }
                style={{
                  width: "100%",
                  marginTop: "20px",
                  padding:
                    "14px 20px",
                  border: "none",
                  borderRadius: "12px",
                  backgroundColor:
                    printMode === "guru" &&
                    !selectedExam
                      ? "#9ca3af"
                      : "#1e293b",
                  color: "#ffffff",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor:
                    printMode === "guru" &&
                    !selectedExam
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                🖨️ Cetak LJK F4
              </button>

            </div>
          )}

        </div>
      )}

      {/* =====================================================
          KERTAS F4
      ====================================================== */}

      {canShowSheet && (
        <div
          id="answer-sheet-print"
          style={{
            position: "relative",

            width: "210mm",
            height: "330mm",

            margin: "0 auto",

            padding:
              "14mm 15mm 14mm",

            backgroundColor:
              "#ffffff",

            boxSizing:
              "border-box",

            overflow: "hidden",

            boxShadow: isPrinting
              ? "none"
              : "0 4px 20px rgba(0,0,0,0.15)",
          }}
        >

          {/* =================================================
              MARKER ATAS KIRI
          ================================================== */}

          <div
            style={{
              position: "absolute",
              top: "7mm",
              left: "7mm",
              width: "8mm",
              height: "8mm",
              backgroundColor:
                "#000000",
            }}
          />

          {/* MARKER ATAS KANAN */}

          <div
            style={{
              position: "absolute",
              top: "7mm",
              right: "7mm",
              width: "8mm",
              height: "8mm",
              backgroundColor:
                "#000000",
            }}
          />

          {/* =================================================
              KOP SEKOLAH
          ================================================== */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",
              minHeight: "25mm",
              textAlign: "center",
            }}
          >

            {/* LOGO */}

            <div
              style={{
                width: "20mm",
                height: "20mm",
                border:
                  "1px solid #000000",
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "center",
                fontSize: "8px",
                marginRight: "7mm",
                flexShrink: 0,
              }}
            >
              LOGO
            </div>

            {/* NAMA SEKOLAH */}

            <div
              style={{
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: "17px",
                  fontWeight: "800",
                  textTransform:
                    "uppercase",
                }}
              >
                {schoolName}
              </div>

              <div
                style={{
                  marginTop: "3px",
                  fontSize: "8px",
                }}
              >
                {schoolAddress}
              </div>
            </div>

          </div>

          {/* GARIS KOP */}

          <div
            style={{
              borderTop:
                "2px solid #000000",
              borderBottom:
                "1px solid #000000",
              height: "4px",
              marginBottom: "5px",
            }}
          />

          {/* =================================================
              JUDUL
          ================================================== */}

          <div
            style={{
              textAlign: "center",
            }}
          >
            <h1
              style={{
                margin:
                  "3px 0 0 0",
                fontSize: "16px",
                fontWeight: "800",
              }}
            >
              LEMBAR JAWABAN
            </h1>

            <p
              style={{
                margin:
                  "2px 0 0 0",
                fontSize: "8px",
                fontWeight: "700",
              }}
            >
              PILIHAN GANDA{" "}
              {multipleChoiceCount} SOAL

              {essayCount > 0 &&
                ` + ESSAY ${essayCount} SOAL`}
            </p>
          </div>

          {/* =================================================
              IDENTITAS
          ================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              columnGap: "12mm",
              rowGap: "2mm",
              marginTop: "6mm",
              fontSize: "8px",
            }}
          >

            {[
              "Nama",
              "Mapel",
              "Hari/Tanggal",
              "Kelas",
              "Ruang",
            ].map((label) => (
              <div
                key={label}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "25mm 4mm 1fr",
                  alignItems:
                    "center",
                }}
              >

                <span>
                  {label}
                </span>

                <span>:</span>

                <div
                  style={{
                    height: "4mm",
                    borderBottom:
                      "1px solid #000000",
                  }}
                />

              </div>
            ))}

          </div>

          {/* =================================================
              PETUNJUK
          ================================================== */}

          <div
            style={{
              marginTop: "5mm",
              padding: "2.5mm",
              border:
                "1px solid #000000",
              fontSize: "7.5px",
            }}
          >
            <strong>
              Petunjuk:
            </strong>{" "}
            Hitamkan bulatan jawaban yang
            paling tepat. Gunakan pensil 2B
            atau alat tulis sesuai petunjuk
            pengawas.
          </div>

          {/* =================================================
              PILIHAN GANDA
          ================================================== */}

          <div
            style={{
              marginTop: "4mm",
              marginBottom: "2mm",
              paddingBottom: "1mm",
              borderBottom:
                "1px solid #000000",
              fontSize: "9px",
              fontWeight: "700",
            }}
          >
            PILIHAN GANDA
          </div>

          {/* =================================================
              KOLOM OTOMATIS
          ================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                `repeat(${columnCount}, 1fr)`,
              columnGap:
                columnCount === 3
                  ? "5mm"
                  : "10mm",
              width: "100%",
            }}
          >

            {columns.map(
              (column, columnIndex) => (
                <div
                  key={columnIndex}
                >

                  {column.map(
                    (number) => (
                      <div
                        key={number}
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          height:
                            questionRowHeight,
                          fontSize:
                            columnCount === 3
                              ? "6px"
                              : "7px",
                          whiteSpace:
                            "nowrap",
                        }}
                      >

                        {/* NOMOR */}

                        <span
                          style={{
                            width:
                              columnCount === 3
                                ? "7mm"
                                : "9mm",

                            textAlign:
                              "right",

                            marginRight:
                              "1.5mm",

                            fontWeight:
                              "700",
                          }}
                        >
                          {number}.
                        </span>

                        {/* A-E */}

                        {[
                          "A",
                          "B",
                          "C",
                          "D",
                          "E",
                        ].map(
                          (choice) => (
                            <div
                              key={
                                choice
                              }
                              style={{
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                gap:
                                  columnCount ===
                                  3
                                    ? "0.6mm"
                                    : "1mm",
                                width:
                                  columnCount ===
                                  3
                                    ? "7.2mm"
                                    : "10mm",
                              }}
                            >

                              <div
                                style={{
                                  width:
                                    bubbleSize,
                                  height:
                                    bubbleSize,
                                  border:
                                    "1.2px solid #000000",
                                  borderRadius:
                                    "50%",
                                  flexShrink:
                                    0,
                                }}
                              />

                              <span>
                                {
                                  choice
                                }
                              </span>

                            </div>
                          )
                        )}

                      </div>
                    )
                  )}

                </div>
              )
            )}

          </div>

          {/* =================================================
              ESSAY
          ================================================== */}

          {essayCount > 0 && (
            <div
              style={{
                marginTop: "4mm",
              }}
            >

              {/* JUDUL ESSAY */}

              <div
                style={{
                  marginBottom:
                    "1.5mm",
                  paddingBottom:
                    "1.5mm",
                  borderBottom:
                    "1px solid #000000",
                  fontSize: "9px",
                  fontWeight: "700",
                }}
              >
                ESSAY
              </div>

              {/* GARIS ESSAY */}

              <div
                style={{
                  width: "100%",
                }}
              >

                {Array.from({
                  length:
                    essayLineCount,
                }).map(
                  (_, index) => (
                    <div
                      key={index}
                      style={{
                        width: "100%",

                        height:
                          essayLineHeight,

                        borderBottom:
                          "1px solid #000000",

                        boxSizing:
                          "border-box",
                      }}
                    />
                  )
                )}

              </div>

            </div>
          )}

          {/* =================================================
              MARKER BAWAH KIRI
          ================================================== */}

          <div
            style={{
              position: "absolute",
              bottom: "7mm",
              left: "7mm",
              width: "8mm",
              height: "8mm",
              backgroundColor:
                "#000000",
            }}
          />

          {/* MARKER BAWAH KANAN */}

          <div
            style={{
              position: "absolute",
              bottom: "7mm",
              right: "7mm",
              width: "8mm",
              height: "8mm",
              backgroundColor:
                "#000000",
            }}
          />

        </div>
      )}

    </div>
  )
}

export default AnswerSheet