// Future Machine Learning Backend API integration
export const mlApi = {
  /**
   * Upload an aerial/drone image to the backend.
   * @param {File} file 
   * @returns {Promise<{image_id: string, name: string}>}
   */
  async uploadImage(file) {
    console.log('[API] mlApi.uploadImage called with:', file.name);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          image_id: `img_${Date.now()}`,
          name: file.name
        });
      }, 1000);
    });
  },

  /**
   * Run building detection & segmentation using YOLOv11-Seg.
   * @param {string} imageId 
   * @param {string} modelId 
   * @returns {Promise<{analysis_id: string, status: string}>}
   */
  async runAnalysis(imageId, modelId = 'building_yolo11') {
    console.log(`[API] mlApi.runAnalysis starting for ${imageId} using ${modelId}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          analysis_id: `analysis_${Date.now()}`,
          status: 'processing'
        });
      }, 500);
    });
  },

  /**
   * Check the processing status of the analysis.
   * @param {string} analysisId 
   * @returns {Promise<{analysis_id: string, status: string, progress: number}>}
   */
  async getAnalysisStatus(analysisId) {
    console.log('[API] mlApi.getAnalysisStatus called for:', analysisId);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          analysis_id: analysisId,
          status: 'completed',
          progress: 100
        });
      }, 300);
    });
  }
};
