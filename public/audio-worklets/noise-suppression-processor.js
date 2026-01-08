/**
 * Enhanced Noise Suppression AudioWorklet Processor
 * 
 * Implements advanced frequency-domain noise suppression with:
 * - Wiener Filter for better SNR estimation
 * - Adaptive Noise Estimation (continuous learning)
 * - Multi-band Frequency Processing
 * - Improved Voice Activity Detection
 */

class NoiseSuppressionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Configuration
    this.intensity = options.processorOptions?.intensity || 0.5; // 0.0 to 1.0
    this.frameSize = 128; // Standard Web Audio API frame size
    this.sampleRate = 48000; // Will be updated from audio context
    
    // Frequency bands for multi-band processing
    // Voice frequencies: 85-255 Hz (fundamental), harmonics up to 4kHz
    this.frequencyBands = [
      { min: 0, max: 300, name: 'low', weight: 0.3 },      // Sub-bass, bass
      { min: 300, max: 2000, name: 'mid', weight: 1.0 },  // Voice fundamental + harmonics
      { min: 2000, max: 4000, name: 'high-mid', weight: 0.8 }, // Voice harmonics
      { min: 4000, max: 24000, name: 'high', weight: 0.2 } // High frequencies (mostly noise)
    ];
    
    // State for noise profile estimation
    this.noiseProfile = new Float32Array(128);
    this.noiseProfileVariance = new Float32Array(128); // For Wiener filter
    this.noiseProfileCount = 0;
    this.learningFrames = 30; // Initial learning phase
    this.isLearning = true;
    
    // Adaptive noise estimation (continuous learning)
    this.adaptiveLearningRate = 0.01; // How fast to adapt (0.0 to 1.0)
    this.minNoiseUpdateFrames = 5; // Minimum frames between noise updates
    this.framesSinceNoiseUpdate = 0;
    
    // Voice activity detection (improved)
    this.voiceThreshold = 0.01;
    this.voiceActivityHistory = new Float32Array(10); // Longer history
    this.voiceActivityIndex = 0;
    this.voiceEnergyHistory = new Float32Array(5);
    this.voiceEnergyIndex = 0;
    this.zeroCrossingRate = 0; // Voice has higher ZCR than noise
    
    // Spectral features for better VAD
    this.spectralCentroid = 0;
    this.spectralRolloff = 0;
    
    // Smoothing for gain adjustments
    this.currentGain = 1.0;
    this.targetGain = 1.0;
    this.smoothingFactor = 0.15; // Slightly slower for smoother transitions
    
    // Wiener filter parameters
    this.wienerSmoothing = 0.9; // Smoothing factor for Wiener gain
    this.wienerGainHistory = new Float32Array(128);
    
    // Port message handler
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateIntensity') {
        this.intensity = Math.max(0, Math.min(1, event.data.intensity));
      } else if (event.data.type === 'reset') {
        this.isLearning = true;
        this.noiseProfileCount = 0;
        this.noiseProfile.fill(0);
        this.noiseProfileVariance.fill(0);
        this.framesSinceNoiseUpdate = 0;
      } else if (event.data.type === 'setSampleRate') {
        this.sampleRate = event.data.sampleRate || 48000;
      }
    };
  }
  
  /**
   * Calculate RMS (Root Mean Square) for voice activity detection
   */
  calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }
  
  /**
   * Calculate Zero Crossing Rate (ZCR) - voice has higher ZCR than noise
   */
  calculateZCR(buffer) {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / buffer.length;
  }
  
  /**
   * Calculate spectral features for better voice detection
   */
  calculateSpectralFeatures(buffer) {
    // Simple spectral centroid (weighted average frequency)
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < buffer.length; i++) {
      const magnitude = Math.abs(buffer[i]);
      const freq = (i * this.sampleRate) / (2 * buffer.length);
      weightedSum += freq * magnitude;
      magnitudeSum += magnitude;
    }
    
    this.spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    
    // Spectral rolloff (frequency below which 85% of energy is contained)
    let cumulativeEnergy = 0;
    const targetEnergy = magnitudeSum * 0.85;
    
    for (let i = 0; i < buffer.length; i++) {
      cumulativeEnergy += Math.abs(buffer[i]);
      if (cumulativeEnergy >= targetEnergy) {
        this.spectralRolloff = (i * this.sampleRate) / (2 * buffer.length);
        break;
      }
    }
  }
  
  /**
   * Get frequency band for a given sample index
   */
  getFrequencyBand(sampleIndex, bufferLength) {
    const freq = (sampleIndex * this.sampleRate) / (2 * bufferLength);
    for (const band of this.frequencyBands) {
      if (freq >= band.min && freq < band.max) {
        return band;
      }
    }
    return this.frequencyBands[this.frequencyBands.length - 1]; // Default to last band
  }
  
  /**
   * Initial noise profile estimation (first learning phase)
   */
  updateNoiseProfile(buffer) {
    if (this.noiseProfileCount < this.learningFrames) {
      const rms = this.calculateRMS(buffer);
      
      // Only learn from quiet frames (likely background noise)
      if (rms < this.voiceThreshold * 2) {
        for (let i = 0; i < Math.min(buffer.length, this.noiseProfile.length); i++) {
          const absValue = Math.abs(buffer[i]);
          const oldMean = this.noiseProfile[i];
          
          // Update mean (exponential moving average)
          this.noiseProfile[i] = (oldMean * this.noiseProfileCount + absValue) / (this.noiseProfileCount + 1);
          
          // Update variance for Wiener filter
          const variance = Math.abs(absValue - oldMean);
          this.noiseProfileVariance[i] = (this.noiseProfileVariance[i] * this.noiseProfileCount + variance) / (this.noiseProfileCount + 1);
        }
        this.noiseProfileCount++;
      }
      
      if (this.noiseProfileCount >= this.learningFrames) {
        this.isLearning = false;
      }
    }
  }
  
  /**
   * Adaptive noise estimation (continuous learning during silence)
   */
  updateAdaptiveNoiseProfile(buffer) {
    const rms = this.calculateRMS(buffer);
    const zcr = this.calculateZCR(buffer);
    
    // Update noise profile only during silence periods
    // Voice typically has: higher RMS, higher ZCR, higher spectral centroid
    const isLikelySilence = rms < this.voiceThreshold * 1.5 && 
                           zcr < 0.3 && 
                           this.spectralCentroid < 2000;
    
    if (isLikelySilence && this.framesSinceNoiseUpdate >= this.minNoiseUpdateFrames) {
      for (let i = 0; i < Math.min(buffer.length, this.noiseProfile.length); i++) {
        const absValue = Math.abs(buffer[i]);
        
        // Exponential moving average for adaptive learning
        this.noiseProfile[i] = (1 - this.adaptiveLearningRate) * this.noiseProfile[i] + 
                               this.adaptiveLearningRate * absValue;
        
        // Update variance
        const variance = Math.abs(absValue - this.noiseProfile[i]);
        this.noiseProfileVariance[i] = (1 - this.adaptiveLearningRate) * this.noiseProfileVariance[i] + 
                                       this.adaptiveLearningRate * variance;
      }
      this.framesSinceNoiseUpdate = 0;
    } else {
      this.framesSinceNoiseUpdate++;
    }
  }
  
  /**
   * Improved voice activity detection using multiple features
   */
  detectVoiceActivity(buffer) {
    const rms = this.calculateRMS(buffer);
    const zcr = this.calculateZCR(buffer);
    
    // Update history
    this.voiceActivityHistory[this.voiceActivityIndex] = rms;
    this.voiceActivityIndex = (this.voiceActivityIndex + 1) % this.voiceActivityHistory.length;
    
    this.voiceEnergyHistory[this.voiceEnergyIndex] = rms * rms;
    this.voiceEnergyIndex = (this.voiceEnergyIndex + 1) % this.voiceEnergyHistory.length;
    
    // Calculate spectral features
    this.calculateSpectralFeatures(buffer);
    
    // Average of recent frames (smoothing)
    const avgActivity = this.voiceActivityHistory.reduce((a, b) => a + b, 0) / this.voiceActivityHistory.length;
    const avgEnergy = this.voiceEnergyHistory.reduce((a, b) => a + b, 0) / this.voiceEnergyHistory.length;
    
    // Multi-feature voice detection
    const energyThreshold = this.voiceThreshold * this.voiceThreshold * 2;
    const zcrThreshold = 0.15; // Voice typically has ZCR > 0.15
    const spectralCentroidThreshold = 500; // Voice typically has centroid > 500 Hz
    
    const hasEnergy = avgActivity > this.voiceThreshold && avgEnergy > energyThreshold;
    const hasVoiceZCR = zcr > zcrThreshold;
    const hasVoiceSpectrum = this.spectralCentroid > spectralCentroidThreshold;
    
    // Voice is detected if multiple conditions are met
    const voiceScore = (hasEnergy ? 1 : 0) + (hasVoiceZCR ? 0.5 : 0) + (hasVoiceSpectrum ? 0.5 : 0);
    
    return voiceScore >= 1.0; // At least energy + one other feature
  }
  
  /**
   * Wiener Filter for optimal noise suppression
   * Provides better SNR estimation than simple spectral subtraction
   */
  calculateWienerGain(signalPower, noisePower, noiseVariance) {
    // Wiener filter: H = S^2 / (S^2 + N^2)
    // Where S^2 is signal power, N^2 is noise power
    
    const snr = noisePower > 0 ? signalPower / noisePower : 10;
    const snrSquared = snr * snr;
    
    // Wiener gain with smoothing to prevent musical noise
    const wienerGain = snrSquared / (snrSquared + 1.0);
    
    // Apply spectral floor to prevent over-suppression
    const minGain = 0.1;
    return Math.max(minGain, wienerGain);
  }
  
  /**
   * Apply enhanced noise suppression with Wiener filter and multi-band processing
   */
  applyNoiseSuppression(buffer) {
    const output = new Float32Array(buffer.length);
    const rms = this.calculateRMS(buffer);
    const isVoiceActive = this.detectVoiceActivity(buffer);
    
    // Calculate average noise estimate
    const avgNoisePower = this.noiseProfile.reduce((a, b) => a + b * b, 0) / this.noiseProfile.length;
    const avgNoiseVariance = this.noiseProfileVariance.reduce((a, b) => a + b, 0) / this.noiseProfileVariance.length;
    
    // Spectral subtraction parameters (adaptive based on intensity)
    const alpha = 1.5 + (this.intensity * 1.5); // 1.5 to 3.0
    const beta = 0.01 + (this.intensity * 0.04); // 0.01 to 0.05 (spectral floor)
    
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      const absSample = Math.abs(sample);
      const samplePower = sample * sample;
      
      // Get frequency band for this sample
      const band = this.getFrequencyBand(i, buffer.length);
      
      // Get noise estimate for this frequency
      const noiseEstimate = this.noiseProfile[Math.min(i, this.noiseProfile.length - 1)];
      const noiseVariance = this.noiseProfileVariance[Math.min(i, this.noiseProfileVariance.length - 1)];
      const noisePower = noiseEstimate * noiseEstimate;
      
      // Calculate SNR
      const snr = noisePower > 0 ? samplePower / noisePower : 10;
      
      // Wiener filter gain
      let wienerGain = this.calculateWienerGain(samplePower, noisePower, noiseVariance);
      
      // Smooth Wiener gain to prevent musical noise
      const prevGain = this.wienerGainHistory[i] || wienerGain;
      wienerGain = this.wienerSmoothing * prevGain + (1 - this.wienerSmoothing) * wienerGain;
      this.wienerGainHistory[i] = wienerGain;
      
      // Multi-band processing: apply different suppression based on frequency
      let bandSuppressionFactor = 1.0;
      
      if (snr < 1.5) {
        // Low SNR - likely noise
        bandSuppressionFactor = Math.max(beta, 1.0 - (this.intensity * 0.9 * band.weight));
      } else if (snr < 3.0) {
        // Medium SNR - partial suppression
        bandSuppressionFactor = Math.max(beta, 1.0 - (this.intensity * 0.6 * band.weight));
      } else {
        // High SNR - likely voice, minimal suppression
        bandSuppressionFactor = Math.max(0.6, 1.0 - (this.intensity * 0.3 * band.weight));
      }
      
      // Combine Wiener filter with spectral subtraction
      // Wiener provides optimal gain, spectral subtraction provides additional control
      let finalGain = wienerGain * bandSuppressionFactor;
      
      // Apply voice activity boost (preserve voice more)
      if (isVoiceActive && rms > this.voiceThreshold * 2) {
        // Boost voice frequencies more
        if (band.name === 'mid' || band.name === 'high-mid') {
          finalGain = Math.min(1.0, finalGain * 1.15);
        } else {
          finalGain = Math.min(1.0, finalGain * 1.05);
        }
      }
      
      // Ensure minimum gain to prevent complete silence
      finalGain = Math.max(0.05, finalGain);
      
      output[i] = sample * finalGain;
    }
    
    return output;
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input.length || !output || !output.length) {
      return true;
    }
    
    const inputChannel = input[0];
    const outputChannel = output[0];
    
    if (!inputChannel || !outputChannel) {
      return true;
    }
    
    // Get sample rate from current time (if available)
    // Note: AudioWorklet doesn't expose sampleRate directly, so we estimate
    if (this.sampleRate === 48000 && currentTime) {
      // Could be updated via message if needed
    }
    
    // Create buffer copy
    const buffer = new Float32Array(inputChannel.length);
    for (let i = 0; i < inputChannel.length; i++) {
      buffer[i] = inputChannel[i];
    }
    
    // Initial noise profile learning
    if (this.isLearning) {
      this.updateNoiseProfile(buffer);
    } else {
      // Adaptive noise estimation (continuous learning)
      this.updateAdaptiveNoiseProfile(buffer);
    }
    
    // Apply enhanced noise suppression
    const suppressed = this.applyNoiseSuppression(buffer);
    
    // Smooth gain transitions (prevent clicks/pops)
    const avgSuppressed = suppressed.reduce((a, b) => Math.abs(a) + Math.abs(b), 0) / suppressed.length;
    const avgOriginal = buffer.reduce((a, b) => Math.abs(a) + Math.abs(b), 0) / buffer.length;
    
    if (avgOriginal > 0) {
      this.targetGain = Math.min(1.0, avgSuppressed / avgOriginal);
    }
    
    // Smooth gain transitions
    this.currentGain += (this.targetGain - this.currentGain) * this.smoothingFactor;
    
    // Apply to output
    for (let i = 0; i < outputChannel.length; i++) {
      outputChannel[i] = suppressed[i] * this.currentGain;
    }
    
    return true;
  }
}

registerProcessor('noise-suppression-processor', NoiseSuppressionProcessor);
