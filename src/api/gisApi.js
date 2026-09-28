// Future GIS Backend API integration
export const gisApi = {
  /**
   * Fetch generated GeoJSON footprints for a given analysis.
   * @param {string} analysisId 
   * @returns {Promise<object>}
   */
  async getGeoJSON(analysisId) {
    console.log('[API] gisApi.getGeoJSON called for:', analysisId);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          type: 'FeatureCollection',
          features: []
        });
      }, 500);
    });
  },

  /**
   * Get active layer statuses (Buildings, Parcels, Roads, etc.).
   * @returns {Promise<object>}
   */
  async getMapLayers() {
    console.log('[API] gisApi.getMapLayers called');
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          buildings: { available: false },
          parcels: { available: false },
          roads: { available: false },
          aerial: { available: true }
        });
      }, 300);
    });
  }
};
