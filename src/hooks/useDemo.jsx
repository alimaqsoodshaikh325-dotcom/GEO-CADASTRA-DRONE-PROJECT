import { createContext, useContext, useState, useEffect } from 'react'

const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [isDemo, setIsDemo] = useState(() => {
    const saved = localStorage.getItem('urban-ai-demo-mode')
    return saved !== null ? JSON.parse(saved) : true // Default to true (Demo Mode) for SIH
  })

  // Share global analysis state so pages can dynamically display results after processing
  const [analysisActive, setAnalysisActive] = useState(() => {
    const saved = localStorage.getItem('urban-ai-analysis-active')
    return saved !== null ? JSON.parse(saved) : false
  })

  const [hasUploaded, setHasUploaded] = useState(() => {
    const saved = localStorage.getItem('urban-ai-has-uploaded')
    return saved !== null ? JSON.parse(saved) : false
  })

  const [uploadedFile, setUploadedFile] = useState(() => {
    const saved = localStorage.getItem('urban-ai-uploaded-file')
    return saved ? JSON.parse(saved) : null
  })

  const [customGeoJSON, setCustomGeoJSON] = useState(() => {
    try {
      const saved = localStorage.getItem('urban-ai-custom-geojson')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const [customParcels, setCustomParcels] = useState(() => {
    try {
      const saved = localStorage.getItem('urban-ai-custom-parcels')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('urban-ai-demo-mode', JSON.stringify(isDemo))
  }, [isDemo])

  useEffect(() => {
    localStorage.setItem('urban-ai-analysis-active', JSON.stringify(analysisActive))
  }, [analysisActive])

  useEffect(() => {
    localStorage.setItem('urban-ai-has-uploaded', JSON.stringify(hasUploaded))
  }, [hasUploaded])

  useEffect(() => {
    if (uploadedFile) {
      localStorage.setItem('urban-ai-uploaded-file', JSON.stringify(uploadedFile))
    } else {
      localStorage.removeItem('urban-ai-uploaded-file')
    }
  }, [uploadedFile])

  useEffect(() => {
    if (customGeoJSON) {
      localStorage.setItem('urban-ai-custom-geojson', JSON.stringify(customGeoJSON))
    } else {
      localStorage.removeItem('urban-ai-custom-geojson')
    }
  }, [customGeoJSON])

  useEffect(() => {
    if (customParcels && customParcels.length > 0) {
      localStorage.setItem('urban-ai-custom-parcels', JSON.stringify(customParcels))
    } else {
      localStorage.removeItem('urban-ai-custom-parcels')
    }
  }, [customParcels])

  const toggleDemo = () => setIsDemo(prev => !prev)

  const resetAnalysis = () => {
    setAnalysisActive(false)
    setHasUploaded(false)
    setUploadedFile(null)
    setCustomGeoJSON(null)
    setCustomParcels([])
    localStorage.removeItem('urban-ai-analysis-active')
    localStorage.removeItem('urban-ai-has-uploaded')
    localStorage.removeItem('urban-ai-uploaded-file')
    localStorage.removeItem('urban-ai-custom-geojson')
    localStorage.removeItem('urban-ai-custom-parcels')
  }

  return (
    <DemoContext.Provider value={{
      isDemo,
      toggleDemo,
      analysisActive,
      setAnalysisActive,
      hasUploaded,
      setHasUploaded,
      uploadedFile,
      setUploadedFile,
      customGeoJSON,
      setCustomGeoJSON,
      customParcels,
      setCustomParcels,
      resetAnalysis
    }}>
      {children}
    </DemoContext.Provider>
  )
}

export function useDemo() {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo must be used within a DemoProvider')
  return context
}
