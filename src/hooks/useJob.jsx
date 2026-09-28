import { createContext, useContext, useState } from 'react'

const JobContext = createContext(null)

export function JobProvider({ children }) {
  const [jobId, setJobId] = useState(null)

  return (
    <JobContext.Provider value={{ jobId, setJobId }}>
      {children}
    </JobContext.Provider>
  )
}

export function useJob() {
  const context = useContext(JobContext)
  if (!context) {
    throw new Error('useJob must be used within JobProvider')
  }
  return context
}
