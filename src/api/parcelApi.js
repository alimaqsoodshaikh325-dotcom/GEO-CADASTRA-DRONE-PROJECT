// Future Parcel/Cadastral Backend API integration
export const parcelApi = {
  /**
   * Fetch parcel and coverage analysis data.
   * @param {string} [analysisId] 
   * @returns {Promise<Array<object>>}
   */
  async getParcels(analysisId) {
    console.log('[API] parcelApi.getParcels called for:', analysisId);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([]);
      }, 400);
    });
  },

  /**
   * Upload an external cadastral parcel layer (GeoJSON, Shapefile, GeoPackage).
   * @param {File} file 
   * @returns {Promise<{success: boolean, parcel_layer_id: string, message: string}>}
   */
  async uploadParcelLayer(file) {
    console.log('[API] parcelApi.uploadParcelLayer called for:', file.name);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          parcel_layer_id: `layer_${Date.now()}`,
          message: 'Parcel layer uploaded and processed successfully.'
        });
      }, 1000);
    });
  }
};
