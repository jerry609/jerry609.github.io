import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type ArchMode = 'gpu' | 'npu'
export type PrecisionMode = 'fp8' | 'bf16' | 'fp32'
export type WorkloadMode = 'prefill' | 'decode' | 'flashattn' | 'allreduce'
export type CutawayMode = 'assembled' | 'cutaway' | 'exploded' | 'xray'
export type CameraPreset = 'hero' | 'floorplan' | 'section' | 'hbm' | 'io'
export type PartId = 'ALL' | 'compute' | 'hbm' | 'interposer' | 'kv' | 'io' | 'thermal' | 'pcb'
export type HardwareProfile = 'flagship' | 'h100_910c'
export type DispatchScenario = 'none' | 'f1_launch' | 'f2_stream' | 'f3_unopt' | 'f3_opt'

export interface TeardownEngineOptions {
  profile?: HardwareProfile
  initialArch?: ArchMode
  initialCutaway?: CutawayMode
  initialScenario?: DispatchScenario
  initialPrecision?: PrecisionMode
  initialWorkload?: WorkloadMode
  initialBatch?: number
  haloEnabled?: boolean
}

export interface HardwareTelemetry {
  arch: ArchMode
  precision: PrecisionMode
  workload: WorkloadMode
  peakTflops: number
  peakHbmBw: number
  peakLinkGbps: number
  ridgePoint: number
  ai: number
  achievedTflops: number
  hbmBw: number
  mfu: number
  l2Hit: number
  linkGbps: number
  tdpWatts: number
  tempC: number
  phaseDeg: number
  regime: 'COMPUTE-BOUND' | 'MEMORY-BOUND' | 'COMM-BOUND' | 'LAUNCH-BOUND' | 'UB-OVERFLOW'
  dmaDuty: number
  mmaDuty: number
  vecDuty: number
  commDuty: number
  note: string
  activeUnitsLabel?: string
  onChipLabel?: string
  profilerSignal?: string
  dispatchAction?: string
  alertLevel?: 'ok' | 'warn' | 'error'
}

export interface PartInfo {
  id: Exclude<PartId, 'ALL'>
  title: string
  subtitle: string
  blogLayer: string
  blogLabel: string
  color: string
  profilerCounter?: string
  kernelKnob?: string
}

export const PART_CATALOG: Record<ArchMode, Record<Exclude<PartId, 'ALL'>, PartInfo>> = {
  gpu: {
    thermal: {
      id: 'thermal',
      title: 'MICRO-FIN COLD PLATE',
      subtitle: 'Direct-to-Chip Copper Vapor Chamber · 1000W TDP',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#00CD6E'
    },
    kv: {
      id: 'kv',
      title: 'PAGED KV & L2 FABRIC',
      subtitle: '128 MB Unified L2 SRAM · TMA Tile Staging',
      blogLayer: 'model',
      blogLabel: 'L4 MODEL',
      color: '#DE99FE'
    },
    compute: {
      id: 'compute',
      title: 'DUAL-RETICLE TENSOR DIE',
      subtitle: '148 SMs · 5th-Gen Tensor Cores · 10 TB/s NV-HBI',
      blogLayer: 'training',
      blogLabel: 'L3 TRAINING',
      color: '#FA6D01'
    },
    hbm: {
      id: 'hbm',
      title: '8× HBM3E 12-HI STACKS',
      subtitle: '192 GB · 8.0 TB/s Peak · 8192-bit TSV Bus',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#2B5CFF'
    },
    interposer: {
      id: 'interposer',
      title: 'CoWoS-L INTERPOSER',
      subtitle: '2.5D LSI Bridges · Sub-micron Copper Routing',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#00CD6E'
    },
    io: {
      id: 'io',
      title: 'NVLINK 5.0 OPTICAL I/O',
      subtitle: '1.8 TB/s Bidirectional AllReduce Fabric',
      blogLayer: 'runtime',
      blogLabel: 'L5 RUNTIME',
      color: '#2B5CFF'
    },
    pcb: {
      id: 'pcb',
      title: 'SXM PCB · VRM · GOLD BGA',
      subtitle: '16-Phase Power Delivery · ABF Substrate',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#108D47'
    }
  },
  npu: {
    thermal: {
      id: 'thermal',
      title: 'OAM VAPOR CHAMBER LID',
      subtitle: 'Liquid-Cooled Cold Plate · Dual Manifold',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#00CD6E'
    },
    kv: {
      id: 'kv',
      title: 'L1 UB & L0A/B/C SRAM',
      subtitle: 'On-Chip Scratchpad SRAM · Explicit Tiling',
      blogLayer: 'model',
      blogLabel: 'L4 MODEL',
      color: '#DE99FE'
    },
    compute: {
      id: 'compute',
      title: 'DA VINCI CUBE + VECTOR',
      subtitle: '16×16×16 Systolic Cube · SIMD Vector · Scalar',
      blogLayer: 'training',
      blogLabel: 'L3 TRAINING',
      color: '#FA6D01'
    },
    hbm: {
      id: 'hbm',
      title: '8× HBM3 + MTE2 DMA',
      subtitle: '128 GB · 3.2 TB/s · Async Double-Buffered DMA',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#2B5CFF'
    },
    interposer: {
      id: 'interposer',
      title: '2.5D INTERPOSER + MTE',
      subtitle: 'Dedicated MTE1/MTE2/MTE3 Data Movement Fabric',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#00CD6E'
    },
    io: {
      id: 'io',
      title: 'HCCS OPTICAL LINKS',
      subtitle: '784 GB/s Collective Ring & Mesh Topology',
      blogLayer: 'runtime',
      blogLabel: 'L5 RUNTIME',
      color: '#2B5CFF'
    },
    pcb: {
      id: 'pcb',
      title: 'OAM PCB · BGA · VRM',
      subtitle: 'High-Current Busbar · ABF Organic Package',
      blogLayer: 'systems',
      blogLabel: 'L2 SYSTEMS',
      color: '#108D47'
    }
  }
}

export const H100_910C_CATALOG: Record<ArchMode, Record<Exclude<PartId, 'ALL'>, PartInfo>> = {
  gpu: {
    thermal: {
      id: 'thermal',
      title: 'SXM5 VAPOR COLD PLATE',
      subtitle: 'Direct-to-Chip Copper Plate · 700W TDP · 814 mm² Die',
      blogLayer: 'systems',
      blogLabel: 'THERMAL',
      color: '#0E9972',
      profilerCounter: 'nvidia-smi: power.draw · clocks_throttle_reasons',
      kernelKnob: 'Sustained boost clock gating under 700W envelope'
    },
    kv: {
      id: 'kv',
      title: '228 KB SMEM/SM · 50 MB L2',
      subtitle: 'Split L2 Crossbar · TMA Async Tile Staging · 16B Align',
      blogLayer: 'model',
      blogLabel: 'ON-CHIP',
      color: '#7E4F8E',
      profilerCounter: 'ncu: lts__t_sector_hit_rate · shared_bank_conflicts',
      kernelKnob: 'num_stages (1–3) · Swizzle layout · Register cap ≤ 256KB/SM'
    },
    compute: {
      id: 'compute',
      title: 'GH100 MONOLITHIC DIE',
      subtitle: '8 GPCs · 132 Active SMs · 4th-Gen Tensor · 989 TFLOPS BF16',
      blogLayer: 'training',
      blogLabel: 'COMPUTE',
      color: '#FA6D01',
      profilerCounter: 'ncu: sm__throughput · sm__warps_active · tensor_pipe',
      kernelKnob: 'wave_ratio = (B·H_kv)/132 · Split-KV + LSE Combine'
    },
    hbm: {
      id: 'hbm',
      title: '5+1 HBM3 STACKS (80 GB)',
      subtitle: '5 Active HBM3 + 1 Fused-Off Dummy · 3.35 TB/s · 5120-bit',
      blogLayer: 'systems',
      blogLabel: 'MEMORY',
      color: '#0E9EE4',
      profilerCounter: 'ncu: dram__throughput.avg.pct_of_peak_sustained',
      kernelKnob: 'GQA group reuse (G×) · 128-bit coalesced vector load'
    },
    interposer: {
      id: 'interposer',
      title: 'CoWoS-S SILICON INTERPOSER',
      subtitle: 'Passive 2.5D Routing · 5 Active HBM3 Channels + L2 Bus',
      blogLayer: 'systems',
      blogLabel: 'PACKAGE',
      color: '#0E9972',
      profilerCounter: 'ncu: l1tex__data_pipe_lsu · dram__bytes_read',
      kernelKnob: 'Align page table & KV strides to 16B / 128B cache lines'
    },
    io: {
      id: 'io',
      title: 'NVLINK 4.0 · 18 LINKS',
      subtitle: '900 GB/s Bidirectional · PCIe Gen5 Host Launch (4 µs)',
      blogLayer: 'runtime',
      blogLabel: 'HOST / IO',
      color: '#2B5CFF',
      profilerCounter: 'nsys: cudaLaunchKernel gap · GPU active ratio',
      kernelKnob: 'Single-pass F1 kernel avoids +22% 2nd launch tax'
    },
    pcb: {
      id: 'pcb',
      title: 'H100 SXM5 CARRIER PCB',
      subtitle: '700W Multi-Phase VRM · Mezzanine Gold BGA Socket',
      blogLayer: 'systems',
      blogLabel: 'CARRIER',
      color: '#108D47',
      profilerCounter: 'nsys: kernel duration vs host dispatch floor (4 µs)',
      kernelKnob: 'Step 0 Hardware Ruler locked prior to 4D partitioning'
    }
  },
  npu: {
    thermal: {
      id: 'thermal',
      title: 'OAM DUAL-DIE COLD PLATE',
      subtitle: 'Dual-Chiplet Vapor Lid · 650W Envelope · Balanced Cooling',
      blogLayer: 'systems',
      blogLabel: 'THERMAL',
      color: '#0E9972',
      profilerCounter: 'npu-smi: power / temp across Die 0 & Die 1',
      kernelKnob: 'Symmetric Split-S prevents hot-spot skew across chiplets'
    },
    kv: {
      id: 'kv',
      title: '192 KB UB/AIV · 512 KB L1/AIC',
      subtitle: 'Explicit Scratchpad SRAM · Hard Overflow Cliff · 32B Align',
      blogLayer: 'model',
      blogLabel: 'ON-CHIP',
      color: '#E0523B',
      profilerCounter: 'msprof: ub_alloc_bytes ≤ 192 KB · mte2_wait_ratio',
      kernelKnob: 'BUFFER_NUM=2 (F2 Ping-Pong) vs BUFFER_NUM=1, Bc=32 (F3 Safe)'
    },
    compute: {
      id: 'compute',
      title: 'DUAL-DIE DA VINCI v2',
      subtitle: '2×(24 AIC + 48 AIV) = 48 AIC / 96 AIV · 800 TFLOPS BF16',
      blogLayer: 'training',
      blogLabel: 'COMPUTE',
      color: '#FA6D01',
      profilerCounter: 'msprof: aic_mac_ratio · aiv_vec_ratio · pipe_stall',
      kernelKnob: 'Decoupled Cube (QKᵀ, PV) ⇄ Vector (Online Softmax) Ping-Pong'
    },
    hbm: {
      id: 'hbm',
      title: '8× HBM2E STACKS (128 GB)',
      subtitle: '4 Stacks per Die · 3.2 TB/s Aggregate · MTE2 Async DMA',
      blogLayer: 'systems',
      blogLabel: 'MEMORY',
      color: '#0E9EE4',
      profilerCounter: 'msprof: aic_mte2_ratio · hbm_read_bw (GB/s)',
      kernelKnob: '32B/512B aligned GM → L1/UB bursts hide MTE2 latency'
    },
    interposer: {
      id: 'interposer',
      title: '2.5D DUAL-DIE SILICON BRIDGE',
      subtitle: 'Die-to-Die Co-Package Bridge · MTE1/MTE2/MTE3 Fabric',
      blogLayer: 'systems',
      blogLabel: 'PACKAGE',
      color: '#0E9972',
      profilerCounter: 'msprof: inter-die balance · blockDim vs 48 AIC / 96 AIV',
      kernelKnob: 'Split-S across both dies eliminates half-chip under-utilization'
    },
    io: {
      id: 'io',
      title: 'UB / HCCS INTERCONNECT',
      subtitle: '784 GB/s Bidirectional · 12 µs Launch & Pipeline Cold-Start',
      blogLayer: 'runtime',
      blogLabel: 'HOST / IO',
      color: '#2B5CFF',
      profilerCounter: 'msprof: Task Wait Time · Kernel Launch Overhead (12 µs)',
      kernelKnob: 'F1 small-tile single-buffer keeps short-seq latency tight'
    },
    pcb: {
      id: 'pcb',
      title: 'ASCEND 910C OAM CARRIER',
      subtitle: 'Dual-Die ABF Organic Substrate · High-Current Busbar',
      blogLayer: 'systems',
      blogLabel: 'CARRIER',
      color: '#108D47',
      profilerCounter: 'msprof: Timeline end-to-end vs roofline T_ideal(w)',
      kernelKnob: 'Step 0 Hardware Ruler: 800 TFLOPS / 3.2 TB/s / 192 KB UB'
    }
  }
}

export function computeHardwareTelemetry(
  arch: ArchMode,
  precision: PrecisionMode,
  workload: WorkloadMode,
  batch: number,
  cycle: number,
  profile: HardwareProfile = 'flagship',
  scenario: DispatchScenario = 'none'
): HardwareTelemetry {
  if (profile === 'h100_910c') {
    const osc = 0.96 + 0.04 * Math.sin(cycle * 0.14)
    if (arch === 'gpu') {
      const peakTflops = precision === 'fp8' ? 1979 : precision === 'bf16' ? 989 : 67
      const peakHbmBw = 3.35
      const peakLinkGbps = 900
      const ridgePoint = Math.round(peakTflops / peakHbmBw)
      const sc = scenario === 'none' ? 'f2_stream' : scenario
      if (sc === 'f1_launch') {
        const hbmBw = 0.36 * osc
        const achievedTflops = 2.4 * osc
        return {
          arch,
          precision,
          workload: 'decode',
          peakTflops,
          peakHbmBw,
          peakLinkGbps,
          ridgePoint,
          ai: 4.2,
          achievedTflops,
          hbmBw,
          mfu: (achievedTflops / peakTflops) * 100,
          l2Hit: 91,
          linkGbps: 42,
          tdpWatts: Math.round(235 * osc),
          tempC: 43,
          phaseDeg: Math.round((cycle * 6) % 360),
          regime: 'LAUNCH-BOUND',
          dmaDuty: 0.16,
          mmaDuty: 0.12,
          vecDuty: 0.18,
          commDuty: 0.08,
          activeUnitsLabel: '16 / 132 SMs (1-Pass Fused)',
          onChipLabel: '28 KB / 228 KB SMEM · 4.0 µs Floor',
          profilerSignal: 'nsys: kernel 4.3 µs ≈ τ_launch 4 µs · 1-launch avoids +22% tax',
          dispatchAction: 'Route F1: gqa_decode_singlepass (BLOCK_N=32, warps=2, stages=1)',
          alertLevel: 'ok',
          note: 'H100 F1 (B=2, L=512)：访存下界 0.30 µs 远低于 4 µs 发射地板，单遍融合消除二次启动税。'
        }
      }
      if (sc === 'f3_unopt') {
        const hbmBw = 0.41 * osc
        const achievedTflops = 3.1 * osc
        return {
          arch,
          precision,
          workload: 'decode',
          peakTflops,
          peakHbmBw,
          peakLinkGbps,
          ridgePoint,
          ai: 6.4,
          achievedTflops,
          hbmBw,
          mfu: (achievedTflops / peakTflops) * 100,
          l2Hit: 34,
          linkGbps: 68,
          tdpWatts: Math.round(268 * osc),
          tempC: 46,
          phaseDeg: Math.round((cycle * 6) % 360),
          regime: 'MEMORY-BOUND',
          dmaDuty: 0.24,
          mmaDuty: 0.12,
          vecDuty: 0.15,
          commDuty: 0.1,
          activeUnitsLabel: '16 / 132 SMs ACTIVE (88% IDLE!)',
          onChipLabel: 'wave_ratio = 0.12 · 12% Peak_bw',
          profilerSignal: 'ncu: dram__throughput 12.2% · sm__warps_active 11.8% (SM Starved)',
          dispatchAction: 'SINGLE-KERNEL FAILURE: 1-stage grid (B=2, H_kv=8) stalls 116 SMs',
          alertLevel: 'error',
          note: 'H100 F3 单核失效 (B=2, L=64K)：仅 16/132 个 SM 工作，5 颗 HBM3 带宽利用率塌方至 12%。'
        }
      }
      if (sc === 'f3_opt') {
        const hbmBw = 2.86 * osc
        const achievedTflops = 22.8 * osc
        return {
          arch,
          precision,
          workload: 'decode',
          peakTflops,
          peakHbmBw,
          peakLinkGbps,
          ridgePoint,
          ai: 7.8,
          achievedTflops,
          hbmBw,
          mfu: (achievedTflops / peakTflops) * 100,
          l2Hit: 82,
          linkGbps: 118,
          tdpWatts: Math.round(582 * osc),
          tempC: 67,
          phaseDeg: Math.round((cycle * 6) % 360),
          regime: 'MEMORY-BOUND',
          dmaDuty: 0.92,
          mmaDuty: 0.72,
          vecDuty: 0.68,
          commDuty: 0.24,
          activeUnitsLabel: '128 / 132 SMs ACTIVE (S=8 Splits)',
          onChipLabel: '50 MB L2 LSE Merge · 85% Peak_bw',
          profilerSignal: 'ncu: dram__throughput 85.4% · sm__throughput 91% · +7.0× Speedup',
          dispatchAction: 'Route F3: Split-KV Stage1 (S=8) + LSE Combine (wave_ratio → 0.97)',
          alertLevel: 'ok',
          note: 'H100 F3 分族路由 (B=2, L=64K)：动态 Split-KV 填满 128/132 SMs，50 MB L2 完成无损 LSE 归约。'
        }
      }
      const hbmBw = 2.98 * osc
      const achievedTflops = 24.4 * osc
      return {
        arch,
        precision,
        workload: 'decode',
        peakTflops,
        peakHbmBw,
        peakLinkGbps,
        ridgePoint,
        ai: 7.6,
        achievedTflops,
        hbmBw,
        mfu: (achievedTflops / peakTflops) * 100,
        l2Hit: 79,
        linkGbps: 110,
        tdpWatts: Math.round(596 * osc),
        tempC: 68,
        phaseDeg: Math.round((cycle * 6) % 360),
        regime: 'MEMORY-BOUND',
        dmaDuty: 0.94,
        mmaDuty: 0.74,
        vecDuty: 0.56,
        commDuty: 0.22,
        activeUnitsLabel: '132 / 132 SMs (wave_ratio = 1.94)',
        onChipLabel: '116 KB SMEM · 3-Stage TMA · 89% Peak_bw',
        profilerSignal: 'ncu: dram__throughput 89.0% · lts__hit_rate 79% (G=4 Reuse)',
        dispatchAction: 'Route F2: gqa_decode_singlepass (BLOCK_N=64, warps=4, stages=3)',
        alertLevel: 'ok',
        note: 'H100 F2 流式甜蜜点 (B=32, L=4K)：132 个 SM 满载，5 颗 HBM3 跑出 2.98 TB/s（89% 带宽屋顶）。'
      }
    }

    // Ascend 910C Dual-Die (48 AIC + 96 AIV, 800 TFLOPS BF16, 128 GB HBM2e @ 3.2 TB/s)
    const peakTflops = precision === 'fp32' ? 200 : 800
    const peakHbmBw = 3.2
    const peakLinkGbps = 784
    const ridgePoint = Math.round(peakTflops / peakHbmBw)
    const sc = scenario === 'none' ? 'f2_stream' : scenario
    if (sc === 'f1_launch') {
      const achievedTflops = 112 * osc
      const hbmBw = 0.52 * osc
      return {
        arch,
        precision: precision === 'fp8' ? 'bf16' : precision,
        workload: 'flashattn',
        peakTflops,
        peakHbmBw,
        peakLinkGbps,
        ridgePoint,
        ai: 64,
        achievedTflops,
        hbmBw,
        mfu: (achievedTflops / peakTflops) * 100,
        l2Hit: 84,
        linkGbps: 55,
        tdpWatts: Math.round(240 * osc),
        tempC: 44,
        phaseDeg: Math.round((cycle * 6) % 360),
        regime: 'LAUNCH-BOUND',
        dmaDuty: 0.24,
        mmaDuty: 0.22,
        vecDuty: 0.26,
        commDuty: 0.1,
        activeUnitsLabel: '16 / 48 AIC · 32 / 96 AIV',
        onChipLabel: '76 KB / 192 KB UB · 12 µs Floor',
        profilerSignal: 'msprof: Task Wait 12.1 µs > compute · 32B aligned single-buf',
        dispatchAction: 'Route F1: FlashAttnGqaKernel<1, 32, 64> (low cold-start)',
        alertLevel: 'ok',
        note: 'Ascend 910C F1 (B=2, S=256)：12 µs 发射与管线冷启动主导，小块单缓冲降低尾部抖动。'
      }
    }
    if (sc === 'f3_unopt') {
      return {
        arch,
        precision: precision === 'fp8' ? 'bf16' : precision,
        workload: 'flashattn',
        peakTflops,
        peakHbmBw,
        peakLinkGbps,
        ridgePoint,
        ai: 268,
        achievedTflops: 0,
        hbmBw: 0,
        mfu: 0,
        l2Hit: 0,
        linkGbps: 0,
        tdpWatts: 145,
        tempC: 39,
        phaseDeg: Math.round((cycle * 6) % 360),
        regime: 'UB-OVERFLOW',
        dmaDuty: 0.05,
        mmaDuty: 0.02,
        vecDuty: 0.02,
        commDuty: 0.02,
        activeUnitsLabel: 'COMPILE / RUNTIME FAULT (0% EXEC)',
        onChipLabel: '256 KB > 192 KB UB HARD CLIFF!',
        profilerSignal: 'msprof / ascendc: ERROR UB_ALLOC_OVERFLOW (256 KB > 192 KB/AIV)',
        dispatchAction: 'F2 TEMPLATE CRASH: BUFFER_NUM=2, Bc=64 overflows 192 KB UB at D=256',
        alertLevel: 'error',
        note: 'Ascend 910C F3 UB 溢出悬崖 (S=16K, D=256)：沿用双缓冲模板占用 256 KB，撞穿单 AIV 192 KB 硬上限！'
      }
    }
    if (sc === 'f3_opt') {
      const achievedTflops = 544 * osc
      const hbmBw = 2.48 * osc
      return {
        arch,
        precision: precision === 'fp8' ? 'bf16' : precision,
        workload: 'flashattn',
        peakTflops,
        peakHbmBw,
        peakLinkGbps,
        ridgePoint,
        ai: 274,
        achievedTflops,
        hbmBw,
        mfu: (achievedTflops / peakTflops) * 100,
        l2Hit: 86,
        linkGbps: 162,
        tdpWatts: Math.round(548 * osc),
        tempC: 65,
        phaseDeg: Math.round((cycle * 6) % 360),
        regime: 'COMPUTE-BOUND',
        dmaDuty: 0.84,
        mmaDuty: 0.82,
        vecDuty: 0.78,
        commDuty: 0.28,
        activeUnitsLabel: '48 / 48 AIC · 96 / 96 AIV (2 Dies)',
        onChipLabel: '112 KB / 192 KB UB SAFE (Buf=1)',
        profilerSignal: 'msprof: ub_alloc 112 KB ✓ · aic_mac_ratio 68% · 8× HBM2e 78%',
        dispatchAction: 'Route F3: FlashAttnGqaKernel<1, 32, 32> + Dual-Die Split-S',
        alertLevel: 'ok',
        note: 'Ascend 910C F3 安全分族 (S=16K, D=256)：退回 BUFFER_NUM=1 + Bc=32 守住 192 KB UB，Split-S 打满双 Die 48 AIC / 96 AIV。'
      }
    }
    const achievedTflops = 668 * osc
    const hbmBw = 2.62 * osc
    return {
      arch,
      precision: precision === 'fp8' ? 'bf16' : precision,
      workload: 'flashattn',
      peakTflops,
      peakHbmBw,
      peakLinkGbps,
      ridgePoint,
      ai: 292,
      achievedTflops,
      hbmBw,
      mfu: (achievedTflops / peakTflops) * 100,
      l2Hit: 91,
      linkGbps: 144,
      tdpWatts: Math.round(585 * osc),
      tempC: 67,
      phaseDeg: Math.round((cycle * 6) % 360),
      regime: 'COMPUTE-BOUND',
      dmaDuty: 0.88,
      mmaDuty: 0.92,
      vecDuty: 0.86,
      commDuty: 0.22,
      activeUnitsLabel: '48 / 48 AIC · 96 / 96 AIV (Ping-Pong)',
      onChipLabel: '148 KB / 192 KB UB (Buf=2 Overlap)',
      profilerSignal: 'msprof: aic_mac_ratio 84% · mte2_wait < 6% · Dual-Die Balanced',
      dispatchAction: 'Route F2: FlashAttnGqaKernel<2, 64, 64> (MTE2 ⇄ Cube ⇄ Vec)',
      alertLevel: 'ok',
      note: 'Ascend 910C F2 双缓冲区间 (S=2K, D=128)：148 KB ≤ 192 KB UB，MTE2/Cube/Vector 流水重叠逼近 800 TFLOPS 屋顶。'
    }
  }

  const baseBf16 = arch === 'gpu' ? 1979 : 800
  const precMult = precision === 'fp8' ? 2.0 : precision === 'bf16' ? 1.0 : 0.25
  const peakTflops = Math.round(baseBf16 * precMult)
  const peakHbmBw = arch === 'gpu' ? 8.0 : 3.2
  const peakLinkGbps = arch === 'gpu' ? 1800 : 784
  const ridgePoint = peakTflops / peakHbmBw

  const osc = 0.95 + 0.05 * Math.sin(cycle * 0.14)
  const precBytesScale = precision === 'fp8' ? 1.85 : precision === 'bf16' ? 1.0 : 0.52

  let ai = 200
  let eff = 0.85
  let l2Hit = 68
  let linkUtil = 0.18
  let dmaDuty = 0.45
  let mmaDuty = 0.85
  let vecDuty = 0.35
  let commDuty = 0.15
  let regime: HardwareTelemetry['regime'] = 'COMPUTE-BOUND'
  let note = ''

  if (workload === 'prefill') {
    ai = Math.min(1800, (190 + batch * 4.8) * precBytesScale)
    eff = (arch === 'gpu' ? 0.88 : 0.86) * osc
    l2Hit = Math.min(94, 72 + batch * 0.08)
    linkUtil = 0.16
    dmaDuty = 0.58
    mmaDuty = 0.93
    vecDuty = 0.42
    commDuty = 0.14
    regime = ai >= ridgePoint ? 'COMPUTE-BOUND' : 'MEMORY-BOUND'
    note =
      arch === 'gpu'
        ? `GPU Prefill (B=${batch}, ${precision.toUpperCase()})：大矩阵 GEMM 算术强度 ${Math.round(ai)} OP/B，5th-Gen Tensor Core 与 10 TB/s NV-HBI 桥接进入高 MFU 算力区。`
        : `NPU Prefill (B=${batch}, ${precision.toUpperCase()})：MTE2 双缓冲预取掩盖访存延迟，Cube 脉动阵列算术强度 ${Math.round(ai)} OP/B，持续贴近峰值算力屋顶。`
  } else if (workload === 'decode') {
    ai = Math.min(280, (2.2 + batch * 1.15) * precBytesScale)
    eff = (arch === 'gpu' ? 0.91 : 0.89) * osc
    l2Hit = Math.max(24, 46 - batch * 0.06)
    linkUtil = 0.22
    dmaDuty = 0.94
    mmaDuty = 0.28
    vecDuty = 0.52
    commDuty = 0.2
    regime = 'MEMORY-BOUND'
    note =
      arch === 'gpu'
        ? `GPU Decode KV (B=${batch})：逐 token 扫描 Paged KV Cache，算术强度仅 ${ai.toFixed(1)} OP/B，8 颗 HBM3e 12-Hi 堆叠带宽决定单卡吐字吞吐。`
        : `NPU Decode KV (B=${batch})：自回归阶段受限于 HBM→L1 UB 的 MTE2 搬运带宽，算术强度 ${ai.toFixed(1)} OP/B，典型访存受限区间。`
  } else if (workload === 'flashattn') {
    ai = Math.min(1250, (145 + batch * 3.1) * precBytesScale)
    eff = (arch === 'gpu' ? 0.84 : 0.87) * osc
    l2Hit = Math.min(97, 86 + batch * 0.04)
    linkUtil = 0.12
    dmaDuty = 0.34
    mmaDuty = 0.82
    vecDuty = 0.86
    commDuty = 0.1
    regime = ai >= ridgePoint ? 'COMPUTE-BOUND' : 'MEMORY-BOUND'
    note =
      arch === 'gpu'
        ? `FlashAttention SRAM 融合 (B=${batch})：QKV 分块常驻 Shared Mem / L2，Online Softmax 消除中间矩阵写回，HBM 流量骤降，L2 命中率升至 ${l2Hit.toFixed(0)}%。`
        : `NPU Cube×Vector 流水融合 (B=${batch})：Cube 计算 QKᵀ 后经 L1 UB 直连 Vector Core 做 Online Softmax，极大降低 HBM 往返开销。`
  } else {
    ai = Math.min(680, (95 + batch * 2.4) * precBytesScale)
    eff = (arch === 'gpu' ? 0.76 : 0.74) * osc
    l2Hit = 61
    linkUtil = Math.min(0.95, 0.72 + batch * 0.001) * osc
    dmaDuty = 0.62
    mmaDuty = 0.64
    vecDuty = 0.32
    commDuty = 0.94
    regime = 'COMM-BOUND'
    note =
      arch === 'gpu'
        ? `NVLink 5.0 Ring AllReduce (B=${batch})：反向梯度通信与计算异步重叠，双向 ${Math.round(peakLinkGbps * linkUtil)} GB/s 互联带宽成为多机扩展主瓶颈。`
        : `HCCS 集合通信 Ring AllReduce (B=${batch})：多卡梯度同步拉满 HCCS 光互连通道（${Math.round(peakLinkGbps * linkUtil)} GB/s），需细粒度通信计算掩盖。`
  }

  const theo = Math.min(peakTflops, ai * peakHbmBw)
  const achievedTflops = theo * eff
  const hbmFactor = workload === 'flashattn' ? 0.42 : 1.0
  const hbmBw = Math.min(peakHbmBw, (achievedTflops / Math.max(1, ai)) * hbmFactor)
  const mfu = Math.min(99, (achievedTflops / peakTflops) * 100)
  const linkGbps = peakLinkGbps * linkUtil
  const baseTdp = arch === 'gpu' ? 1000 : 480
  const loadRatio = 0.28 + 0.48 * (mfu / 100) + 0.18 * (hbmBw / peakHbmBw) + 0.06 * linkUtil
  const tdpWatts = Math.round(baseTdp * loadRatio)
  const tempC = Math.round(34 + 38 * loadRatio)

  return {
    arch,
    precision,
    workload,
    peakTflops,
    peakHbmBw,
    peakLinkGbps,
    ridgePoint,
    ai,
    achievedTflops,
    hbmBw,
    mfu,
    l2Hit,
    linkGbps,
    tdpWatts,
    tempC,
    phaseDeg: Math.round((cycle * 6) % 360),
    regime,
    dmaDuty,
    mmaDuty,
    vecDuty,
    commDuty,
    note
  }
}

/* ---------- Procedural High-Craft PBR Canvas Textures ---------- */

function createPcbTexture(profile: HardwareProfile = 'flagship'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#141618'
  g.fillRect(0, 0, 512, 512)

  // Subtle fiberglass weave
  g.strokeStyle = 'rgba(255,255,255,0.025)'
  g.lineWidth = 1
  for (let i = 0; i < 512; i += 8) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i, 512)
    g.stroke()
    g.beginPath()
    g.moveTo(0, i)
    g.lineTo(512, i)
    g.stroke()
  }

  // Routed copper micro-traces
  g.strokeStyle = 'rgba(182, 138, 72, 0.24)'
  g.lineWidth = 1.5
  for (let i = 32; i < 480; i += 18) {
    g.beginPath()
    g.moveTo(16, i)
    g.lineTo(84, i)
    g.lineTo(104, i + (i < 256 ? 12 : -12))
    g.lineTo(160, i + (i < 256 ? 12 : -12))
    g.stroke()

    g.beginPath()
    g.moveTo(496, i)
    g.lineTo(428, i)
    g.lineTo(408, i + (i < 256 ? 12 : -12))
    g.lineTo(352, i + (i < 256 ? 12 : -12))
    g.stroke()
  }

  // Gold vias around perimeter
  g.fillStyle = '#d4a64a'
  for (let i = 28; i < 490; i += 24) {
    for (const edge of [20, 492]) {
      g.beginPath()
      g.arc(i, edge, 2.2, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.arc(edge, i, 2.2, 0, Math.PI * 2)
      g.fill()
    }
  }

  // Silkscreen markings
  g.fillStyle = 'rgba(235,235,230,0.45)'
  g.font = '600 11px ui-monospace, monospace'
  if (profile === 'h100_910c') {
    g.fillText('H100 SXM5 / ASCEND 910C OAM CARRIER', 36, 482)
    g.fillText('CoWoS-S · DUAL-DIE 2.5D', 324, 482)
  } else {
    g.fillText('JERRY609 · SXM5 / OAM CARRIER REV 4.2', 36, 482)
    g.fillText('2.5D CoWoS-L · 1000W VRM', 320, 482)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function createSiliconTexture(accentHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!

  const grad = g.createLinearGradient(0, 0, 512, 512)
  grad.addColorStop(0, '#1a1f2e')
  grad.addColorStop(0.45, '#252b3b')
  grad.addColorStop(0.7, '#1d2432')
  grad.addColorStop(1, '#2a2438')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 512)

  // Lithography cell blocks
  g.strokeStyle = 'rgba(255,255,255,0.08)'
  g.lineWidth = 1
  for (let x = 0; x <= 512; x += 32) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 512)
    g.stroke()
  }
  for (let y = 0; y <= 512; y += 32) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    g.stroke()
  }

  // Sub-micron SRAM hatch
  g.fillStyle = 'rgba(255,255,255,0.045)'
  for (let x = 6; x < 500; x += 32) {
    for (let y = 6; y < 500; y += 32) {
      g.fillRect(x, y, 20, 9)
      g.fillRect(x, y + 12, 12, 8)
    }
  }

  // Subtle accent trace rails
  g.strokeStyle = accentHex
  g.globalAlpha = 0.25
  g.lineWidth = 2
  for (let y = 16; y < 512; y += 64) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    g.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function createColdPlateTexture(
  arch: ArchMode,
  side: 'left' | 'right',
  profile: HardwareProfile = 'flagship'
): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!

  // Brushed nickel-aluminum base
  const grad = g.createLinearGradient(0, 0, 512, 512)
  grad.addColorStop(0, '#c7c9c5')
  grad.addColorStop(0.5, '#dadcd7')
  grad.addColorStop(1, '#b3b6b1')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 512)

  // Fine brushed-metal grain
  for (let y = 0; y < 512; y += 2) {
    g.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.045)'
    g.fillRect(0, y, 512, 1)
  }

  // Outer machined border
  g.strokeStyle = 'rgba(23,23,22,0.52)'
  g.lineWidth = 3
  g.strokeRect(20, 20, 472, 472)

  if (side === 'left') {
    g.fillStyle = profile === 'h100_910c' && arch === 'npu' ? '#E0523B' : '#FA6D01'
    g.fillRect(42, 44, 96, 8)

    g.fillStyle = '#171716'
    g.font = '700 28px ui-monospace, monospace'
    if (profile === 'h100_910c') {
      g.fillText(arch === 'gpu' ? 'H100-SXM5' : 'ASCEND 910C', 42, 98)
    } else {
      g.fillText(arch === 'gpu' ? 'B200-SXM' : 'NPU-910C', 42, 98)
    }

    g.fillStyle = 'rgba(23,23,22,0.72)'
    g.font = '600 15px ui-monospace, monospace'
    if (profile === 'h100_910c') {
      g.fillText(arch === 'gpu' ? 'GH100 MONOLITHIC · 132 SMs' : 'DUAL-DIE DA VINCI v2', 42, 130)
      g.fillText(arch === 'gpu' ? '8 GPC · 228 KB SMEM · 4N' : '48 AIC + 96 AIV · 192KB UB', 42, 156)
    } else {
      g.fillText(arch === 'gpu' ? 'DUAL-RETICLE GPU' : 'DA VINCI AI CORE', 42, 130)
      g.fillText('JERRY609 LABS', 42, 156)
    }

    // Laser-etched industrial alignment crosshair
    g.strokeStyle = 'rgba(23,23,22,0.38)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(92, 420, 22, 0, Math.PI * 2)
    g.moveTo(60, 420)
    g.lineTo(124, 420)
    g.moveTo(92, 388)
    g.lineTo(92, 452)
    g.stroke()

    g.fillStyle = 'rgba(23,23,22,0.65)'
    g.font = '600 13px ui-monospace, monospace'
    if (profile === 'h100_910c') {
      g.fillText(arch === 'gpu' ? 'CoWoS-S · 814 mm² DIE' : '2.5D BRIDGE · CHIPLET', 142, 426)
    } else {
      g.fillText('2.5D CoWoS-L · REV 4.2', 142, 426)
    }
  } else {
    g.fillStyle = '#171716'
    g.font = '700 22px ui-monospace, monospace'
    if (profile === 'h100_910c') {
      g.fillText(arch === 'gpu' ? '80GB HBM3 (5+1)' : '128GB HBM2E ×8', 42, 86)
    } else {
      g.fillText(arch === 'gpu' ? '192GB HBM3E' : '128GB HBM3', 42, 86)
    }

    g.fillStyle = 'rgba(23,23,22,0.72)'
    g.font = '600 15px ui-monospace, monospace'
    if (profile === 'h100_910c') {
      g.fillText(arch === 'gpu' ? '3.35 TB/S · NVLINK 4' : '3.2 TB/S · UB / HCCS', 42, 118)
      g.fillText(arch === 'gpu' ? '989 TFLOPS BF16 · 700W' : '800 TFLOPS BF16 · 650W', 42, 146)
    } else {
      g.fillText(arch === 'gpu' ? '8.0 TB/S · NVLINK 5' : '3.2 TB/S · HCCS OPT', 42, 118)
      g.fillText('DIRECT LIQUID PLATE', 42, 146)
    }

    // Industrial serial barcode
    g.fillStyle = 'rgba(23,23,22,0.78)'
    let bx = 42
    for (let i = 0; i < 28; i++) {
      const w = i % 3 === 0 ? 7 : i % 2 === 0 ? 3 : 5
      g.fillRect(bx, 404, w, 46)
      bx += w + 4
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/* ---------- Camera Presets ---------- */

const CAMERA_PRESETS: Record<CameraPreset, { az: number; el: number; dist: number; targetY: number }> = {
  hero: { az: 0.72, el: 0.54, dist: 16.8, targetY: 0.2 },
  floorplan: { az: 0.02, el: 1.44, dist: 14.2, targetY: 0.0 },
  section: { az: 0.24, el: 0.16, dist: 15.8, targetY: 0.3 },
  hbm: { az: 1.05, el: 0.46, dist: 11.4, targetY: -0.05 },
  io: { az: 0.08, el: 0.36, dist: 12.2, targetY: -0.1 }
}

interface PacketTrack {
  from: THREE.Vector3
  to: THREE.Vector3
  kind: 'hbm' | 'bridge' | 'io'
  offset: number
  speed: number
  arch?: ArchMode
}

interface CalloutAnchor {
  id: Exclude<PartId, 'ALL'>
  group: THREE.Object3D
  localPos: THREE.Vector3
  side: 'left' | 'right'
  yBias: number
}

export interface EngineCallbacks {
  onTelemetry: (hw: HardwareTelemetry) => void
  onHoverPart: (part: PartInfo | null, screenX: number, screenY: number) => void
  onSelectPart: (partId: PartId) => void
  onUserInteract: () => void
  onCalloutsUpdate: (
    items: {
      id: Exclude<PartId, 'ALL'>
      x: number
      y: number
      side: 'left' | 'right'
      title: string
      sub: string
      color: string
      visible: boolean
    }[]
  ) => void
}

export class AcceleratorTeardownEngine {
  private container: HTMLElement
  private cb: EngineCallbacks

  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private pmrem: THREE.PMREMGenerator

  // Lighting refs for live light/dark switching
  private ambientLight: THREE.AmbientLight
  private keyLight: THREE.DirectionalLight
  private rimLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private gridHelper: THREE.GridHelper
  private floorMesh: THREE.Mesh

  // Hardware layer groups
  private rootGroup = new THREE.Group()
  private pcbGroup = new THREE.Group()
  private substrateGroup = new THREE.Group()
  private interposerGroup = new THREE.Group()
  private hbmGroup = new THREE.Group()
  private hbmGpuGroup = new THREE.Group()
  private hbmNpuGroup = new THREE.Group()
  private computeGroup = new THREE.Group()
  private gpuDieGroup = new THREE.Group()
  private npuDieGroup = new THREE.Group()
  private kvGroup = new THREE.Group()
  private ioGroup = new THREE.Group()
  private thermalGroup = new THREE.Group()
  private thermalLeftHalf = new THREE.Group()
  private thermalRightHalf = new THREE.Group()
  private haloGroup = new THREE.Group()
  private guideRodGroup = new THREE.Group()

  // Dynamic animated meshes
  private gpuSmTiles: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; ix: number; iz: number; die: number }[] = []
  private npuCubeTiles: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; idx: number; die?: number }[] = []
  private npuVecTiles: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; idx: number; die?: number }[] = []
  private npuMteTiles: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; idx: number }[] = []
  private npuUbMats: THREE.MeshStandardMaterial[] = []
  private npuD2dBridgeMat: THREE.MeshStandardMaterial | null = null
  private gpuL2CrossbarMat: THREE.MeshStandardMaterial | null = null
  private hbmGlowBars: { mat: THREE.MeshStandardMaterial; idx: number; arch?: ArchMode; dummy?: boolean }[] = []
  private kvBlocks: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; idx: number }[] = []
  private nvBridgeMat!: THREE.MeshStandardMaterial
  private ioBeamMeshes: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; idx: number }[] = []
  private vrmStripMat!: THREE.MeshStandardMaterial
  private coldPlateLeftMat!: THREE.MeshStandardMaterial
  private coldPlateRightMat!: THREE.MeshStandardMaterial
  private thermalFinMats: THREE.MeshStandardMaterial[] = []

  // Packet instanced mesh
  private packetMesh!: THREE.InstancedMesh
  private packetTracks: PacketTrack[] = []
  private dummy = new THREE.Object3D()
  private tmpColor = new THREE.Color()

  // Textures that switch with arch
  private coldPlateTexGpuL: THREE.CanvasTexture
  private coldPlateTexGpuR: THREE.CanvasTexture
  private coldPlateTexNpuL: THREE.CanvasTexture
  private coldPlateTexNpuR: THREE.CanvasTexture

  // Picking & callouts
  private pickables: THREE.Object3D[] = []
  private calloutAnchors: CalloutAnchor[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(-10, -10)

  // State
  private profile: HardwareProfile = 'flagship'
  private scenario: DispatchScenario = 'none'
  private arch: ArchMode = 'gpu'
  private precision: PrecisionMode = 'bf16'
  private workload: WorkloadMode = 'prefill'
  private cutaway: CutawayMode = 'cutaway'
  private isolate: PartId = 'ALL'
  private batch = 32
  private paused = false
  private calloutsEnabled = true
  private haloEnabled = true
  private cycle = 22
  private reduceMotion: boolean

  // Smooth interpolated pose
  private az = CAMERA_PRESETS.hero.az
  private el = CAMERA_PRESETS.hero.el
  private dist = CAMERA_PRESETS.hero.dist
  private targetY = CAMERA_PRESETS.hero.targetY
  private tAz = CAMERA_PRESETS.hero.az
  private tEl = CAMERA_PRESETS.hero.el
  private tDist = CAMERA_PRESETS.hero.dist
  private tTargetY = CAMERA_PRESETS.hero.targetY
  private explode = 0.08
  private tExplode = 0.08
  private cutawaySlide = 1.0
  private tCutawaySlide = 1.0

  // Pointer orbit state
  private dragging = false
  private movedPx = 0
  private lastX = 0
  private lastY = 0
  private visible = true
  private rafId = 0
  private lastTs = 0
  private resizeObs: ResizeObserver
  private interObs: IntersectionObserver
  private themeObs: MutationObserver
  private lastTelemetryTs = 0

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    cb: EngineCallbacks,
    options?: TeardownEngineOptions
  ) {
    this.container = container
    this.cb = cb
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (options?.profile) this.profile = options.profile
    if (options?.initialArch) this.arch = options.initialArch
    if (options?.initialPrecision) this.precision = options.initialPrecision
    if (options?.initialWorkload) this.workload = options.initialWorkload
    if (options?.initialBatch !== undefined) this.batch = options.initialBatch
    if (options?.initialScenario) this.scenario = options.initialScenario
    if (options?.haloEnabled !== undefined) this.haloEnabled = options.haloEnabled
    if (options?.initialCutaway) {
      this.cutaway = options.initialCutaway
      if (this.cutaway === 'exploded') {
        this.explode = 1.0
        this.tExplode = 1.0
        this.cutawaySlide = 0.0
        this.tCutawaySlide = 0.0
      } else if (this.cutaway === 'cutaway') {
        this.explode = 0.12
        this.tExplode = 0.12
        this.cutawaySlide = 1.0
        this.tCutawaySlide = 1.0
      } else if (this.cutaway === 'xray') {
        this.explode = 0.22
        this.tExplode = 0.22
        this.cutawaySlide = 0.0
        this.tCutawaySlide = 0.0
      } else {
        this.explode = 0.0
        this.tExplode = 0.0
        this.cutawaySlide = 0.0
        this.tCutawaySlide = 0.0
      }
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(34, 1.2, 0.2, 120)

    // Studio IBL environment for rich brushed metal & silicon reflections
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = envTex

    // Lights
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.55)
    this.scene.add(this.ambientLight)

    this.keyLight = new THREE.DirectionalLight('#fffaf2', 1.65)
    this.keyLight.position.set(8.5, 14, 9.5)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1024, 1024)
    this.keyLight.shadow.camera.near = 2
    this.keyLight.shadow.camera.far = 35
    this.keyLight.shadow.camera.left = -8
    this.keyLight.shadow.camera.right = 8
    this.keyLight.shadow.camera.top = 8
    this.keyLight.shadow.camera.bottom = -8
    this.keyLight.shadow.bias = -0.0005
    this.scene.add(this.keyLight)

    this.rimLight = new THREE.DirectionalLight('#b8d0ff', 0.85)
    this.rimLight.position.set(-10, 7, -8)
    this.scene.add(this.rimLight)

    this.fillLight = new THREE.DirectionalLight('#ffd9b8', 0.45)
    this.fillLight.position.set(6, 3, -9)
    this.scene.add(this.fillLight)

    // Architectural studio floor + crisp CAD grid
    const floorGeo = new THREE.PlaneGeometry(36, 36)
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.14 })
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat)
    this.floorMesh.rotation.x = -Math.PI / 2
    this.floorMesh.position.y = -2.2
    this.floorMesh.receiveShadow = true
    this.scene.add(this.floorMesh)

    this.gridHelper = new THREE.GridHelper(22, 22, 0x999994, 0xd4d4ce)
    this.gridHelper.position.y = -2.19
    this.scene.add(this.gridHelper)

    this.coldPlateTexGpuL = createColdPlateTexture('gpu', 'left', this.profile)
    this.coldPlateTexGpuR = createColdPlateTexture('gpu', 'right', this.profile)
    this.coldPlateTexNpuL = createColdPlateTexture('npu', 'left', this.profile)
    this.coldPlateTexNpuR = createColdPlateTexture('npu', 'right', this.profile)

    this.scene.add(this.rootGroup)
    this.buildHardwareAssemblies()
    this.applyTheme()
    this.applyArchGeometry()
    this.applyCutawayMaterials()
    this.bindEvents()
    this.resize()

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(this.container)

    this.interObs = new IntersectionObserver(
      (entries) => {
        this.visible = entries[0]?.isIntersecting ?? true
      },
      { threshold: 0.04 }
    )
    this.interObs.observe(this.container)

    this.themeObs = new MutationObserver(() => this.applyTheme())
    this.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    this.tick(0)
  }

  private tagPart(obj: THREE.Object3D, partId: Exclude<PartId, 'ALL'>) {
    obj.traverse((child) => {
      child.userData.partId = partId
      if ((child as THREE.Mesh).isMesh) {
        this.pickables.push(child)
      }
    })
  }

  private getCatalog() {
    return this.profile === 'h100_910c' ? H100_910C_CATALOG : PART_CATALOG
  }

  private buildHardwareAssemblies() {
    const pcbTex = createPcbTexture(this.profile)
    const siliconTexGpu = createSiliconTexture('#FA6D01')
    const siliconTexNpu = createSiliconTexture('#DE99FE')

    /* -------- TIER 0: SXM / OAM Carrier PCB + VRM + Gold BGA -------- */
    const pcbMat = new THREE.MeshStandardMaterial({
      map: pcbTex,
      roughness: 0.62,
      metalness: 0.18
    })
    const pcbBoard = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 6.6), pcbMat)
    pcbBoard.castShadow = true
    pcbBoard.receiveShadow = true
    this.pcbGroup.add(pcbBoard)

    // Gold edge trim rails
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d9a94c',
      metalness: 0.92,
      roughness: 0.22
    })
    // 4 Corner mounting brass standoffs + bolts
    for (const sx of [-3.25, 3.25]) {
      for (const sz of [-2.95, 2.95]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 6), goldMat)
        post.position.set(sx, 0.22, sz)
        post.castShadow = true
        this.pcbGroup.add(post)
      }
    }

    // 16 VRM Power Inductors (8 left + 8 right)
    const vrmBodyMat = new THREE.MeshStandardMaterial({ color: '#2b2d30', metalness: 0.45, roughness: 0.4 })
    const vrmCapMat = new THREE.MeshStandardMaterial({ color: '#787d84', metalness: 0.82, roughness: 0.28 })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const z = -2.1 + i * 0.7
        const choke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.42), vrmBodyMat)
        choke.position.set(side * 3.1, 0.24, z)
        choke.castShadow = true
        this.pcbGroup.add(choke)

        const topMark = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.32), vrmCapMat)
        topMark.position.set(side * 3.1, 0.38, z)
        this.pcbGroup.add(topMark)
      }
    }

    // VRM live thermal power rail strip
    this.vrmStripMat = new THREE.MeshStandardMaterial({
      color: '#FA6D01',
      emissive: '#FA6D01',
      emissiveIntensity: 0.6,
      roughness: 0.35
    })
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 4.7), this.vrmStripMat)
      rail.position.set(side * 2.74, 0.13, 0)
      this.pcbGroup.add(rail)
    }

    // Gold BGA Solder Ball Grid Array underneath substrate (12×12 instanced)
    const bgaGeo = new THREE.SphereGeometry(0.055, 8, 6)
    const bgaCount = 12 * 12
    const bgaInst = new THREE.InstancedMesh(bgaGeo, goldMat, bgaCount)
    let bi = 0
    for (let ix = 0; ix < 12; ix++) {
      for (let iz = 0; iz < 12; iz++) {
        this.dummy.position.set(-2.2 + ix * 0.4, 0.16, -2.2 + iz * 0.4)
        this.dummy.scale.set(1, 0.85, 1)
        this.dummy.updateMatrix()
        bgaInst.setMatrixAt(bi++, this.dummy.matrix)
      }
    }
    this.pcbGroup.add(bgaInst)
    this.tagPart(this.pcbGroup, 'pcb')
    this.rootGroup.add(this.pcbGroup)

    /* -------- TIER 1: Organic ABF Substrate + Perimeter MLCC Caps -------- */
    const subMat = new THREE.MeshStandardMaterial({
      color: '#144432',
      roughness: 0.48,
      metalness: 0.22
    })
    const subBoard = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.18, 5.2), subMat)
    subBoard.castShadow = true
    subBoard.receiveShadow = true
    this.substrateGroup.add(subBoard)

    // Gold Pin-1 corner marker
    const pin1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 3), goldMat)
    pin1.position.set(-2.5, 0.1, 2.35)
    this.substrateGroup.add(pin1)

    // 56 Perimeter MLCC SMD Decoupling Capacitors (instanced)
    const capGeo = new THREE.BoxGeometry(0.11, 0.07, 0.06)
    const capMat = new THREE.MeshStandardMaterial({ color: '#b99364', metalness: 0.65, roughness: 0.35 })
    const capInst = new THREE.InstancedMesh(capGeo, capMat, 56)
    let ci = 0
    for (let i = 0; i < 14; i++) {
      const t = -2.2 + i * 0.34
      for (const z of [-2.38, 2.38]) {
        this.dummy.position.set(t, 0.125, z)
        this.dummy.rotation.set(0, 0, 0)
        this.dummy.scale.set(1, 1, 1)
        this.dummy.updateMatrix()
        capInst.setMatrixAt(ci++, this.dummy.matrix)
      }
      for (const x of [-2.52, 2.52]) {
        this.dummy.position.set(x, 0.125, t * 0.92)
        this.dummy.rotation.set(0, Math.PI / 2, 0)
        this.dummy.scale.set(1, 1, 1)
        this.dummy.updateMatrix()
        capInst.setMatrixAt(ci++, this.dummy.matrix)
      }
    }
    this.dummy.rotation.set(0, 0, 0)
    this.substrateGroup.add(capInst)
    this.tagPart(this.substrateGroup, 'pcb')
    this.rootGroup.add(this.substrateGroup)

    /* -------- TIER 2: 2.5D CoWoS-L Silicon Interposer + Live Bus Packets -------- */
    const interMat = new THREE.MeshStandardMaterial({
      color: '#222836',
      map: siliconTexGpu,
      metalness: 0.84,
      roughness: 0.24
    })
    const interposer = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.13, 4.35), interMat)
    interposer.castShadow = true
    interposer.receiveShadow = true
    this.interposerGroup.add(interposer)

    // LSI Silicon Bridge metallic inlay stripes
    const bridgeInlayMat = new THREE.MeshStandardMaterial({
      color: '#00CD6E',
      emissive: '#00CD6E',
      emissiveIntensity: 0.35,
      metalness: 0.7,
      roughness: 0.25
    })
    for (const x of [-1.25, 0, 1.25]) {
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 3.6), bridgeInlayMat)
      inlay.position.set(x, 0.072, 0)
      this.interposerGroup.add(inlay)
    }

    // Build 3D animated packet tracks on interposer surface
    this.packetTracks = []
    if (this.profile === 'h100_910c') {
      // H100 SXM5: 5 active HBM3 channels (3 left + 2 right, skipping fused-off dummy at side=+1, i=0)
      const h100Z = [-1.18, 0, 1.18]
      for (let i = 0; i < 3; i++) {
        const z = h100Z[i]
        this.packetTracks.push(
          { from: new THREE.Vector3(-1.82, 0.1, z), to: new THREE.Vector3(-0.78, 0.1, z), kind: 'hbm', offset: i * 0.29, speed: 0.98, arch: 'gpu' },
          { from: new THREE.Vector3(-0.78, 0.1, z + 0.15), to: new THREE.Vector3(-1.82, 0.1, z + 0.15), kind: 'hbm', offset: i * 0.29 + 0.5, speed: 0.94, arch: 'gpu' }
        )
        if (i > 0) {
          this.packetTracks.push(
            { from: new THREE.Vector3(1.82, 0.1, z), to: new THREE.Vector3(0.78, 0.1, z), kind: 'hbm', offset: i * 0.31 + 0.12, speed: 0.98, arch: 'gpu' },
            { from: new THREE.Vector3(0.78, 0.1, z - 0.15), to: new THREE.Vector3(1.82, 0.1, z - 0.15), kind: 'hbm', offset: i * 0.31 + 0.62, speed: 0.94, arch: 'gpu' }
          )
        }
      }
      // H100 50 MB Split L2 Crossbar / LSE reduction packets
      for (let i = 0; i < 8; i++) {
        const z = -1.36 + i * 0.39
        this.packetTracks.push({
          from: new THREE.Vector3(-0.65, 0.13, z),
          to: new THREE.Vector3(0.65, 0.13, z),
          kind: 'bridge',
          offset: i * 0.19,
          speed: 1.35,
          arch: 'gpu'
        })
      }
      // Ascend 910C: 8 active HBM2e stacks (4 left for Die 0 + 4 right for Die 1)
      for (let i = 0; i < 4; i++) {
        const z = -1.35 + i * 0.9
        this.packetTracks.push(
          { from: new THREE.Vector3(-1.82, 0.1, z), to: new THREE.Vector3(-0.84, 0.1, z), kind: 'hbm', offset: i * 0.23, speed: 0.92, arch: 'npu' },
          { from: new THREE.Vector3(-0.84, 0.1, z + 0.14), to: new THREE.Vector3(-1.82, 0.1, z + 0.14), kind: 'hbm', offset: i * 0.23 + 0.5, speed: 0.88, arch: 'npu' },
          { from: new THREE.Vector3(1.82, 0.1, z), to: new THREE.Vector3(0.84, 0.1, z), kind: 'hbm', offset: i * 0.27 + 0.15, speed: 0.92, arch: 'npu' },
          { from: new THREE.Vector3(0.84, 0.1, z - 0.14), to: new THREE.Vector3(1.82, 0.1, z - 0.14), kind: 'hbm', offset: i * 0.27 + 0.65, speed: 0.88, arch: 'npu' }
        )
      }
      // Ascend 910C Dual-Die Central Interposer Bridge packets (Die 0 <-> Die 1)
      for (let i = 0; i < 10; i++) {
        const z = -1.45 + i * 0.32
        this.packetTracks.push({
          from: new THREE.Vector3(-0.28, 0.12, z),
          to: new THREE.Vector3(0.28, 0.12, z),
          kind: 'bridge',
          offset: i * 0.17,
          speed: 1.35,
          arch: 'npu'
        })
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const z = -1.35 + i * 0.9
        // Left HBM <-> Left Die
        this.packetTracks.push(
          { from: new THREE.Vector3(-1.82, 0.1, z), to: new THREE.Vector3(-0.78, 0.1, z), kind: 'hbm', offset: i * 0.23, speed: 0.95 },
          { from: new THREE.Vector3(-0.78, 0.1, z + 0.14), to: new THREE.Vector3(-1.82, 0.1, z + 0.14), kind: 'hbm', offset: i * 0.23 + 0.5, speed: 0.9 }
        )
        // Right HBM <-> Right Die
        this.packetTracks.push(
          { from: new THREE.Vector3(1.82, 0.1, z), to: new THREE.Vector3(0.78, 0.1, z), kind: 'hbm', offset: i * 0.27 + 0.15, speed: 0.95 },
          { from: new THREE.Vector3(0.78, 0.1, z - 0.14), to: new THREE.Vector3(1.82, 0.1, z - 0.14), kind: 'hbm', offset: i * 0.27 + 0.65, speed: 0.9 }
        )
      }
      // Die-to-Die central NV-HBI bridge packets
      for (let i = 0; i < 10; i++) {
        const z = -1.45 + i * 0.32
        this.packetTracks.push({
          from: new THREE.Vector3(-0.26, 0.12, z),
          to: new THREE.Vector3(0.26, 0.12, z),
          kind: 'bridge',
          offset: i * 0.17,
          speed: 1.4
        })
      }
    }
    // Edge I/O NVLink/HCCS routing tracks
    for (let i = 0; i < 8; i++) {
      const x = -1.75 + i * 0.5
      this.packetTracks.push(
        { from: new THREE.Vector3(x, 0.1, 1.45), to: new THREE.Vector3(x, 0.1, 2.25), kind: 'io', offset: i * 0.19, speed: 1.1 },
        { from: new THREE.Vector3(x, 0.1, -1.45), to: new THREE.Vector3(x, 0.1, -2.25), kind: 'io', offset: i * 0.19 + 0.4, speed: 1.1 }
      )
    }

    const pktGeo = new THREE.BoxGeometry(0.11, 0.045, 0.06)
    const pktMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    this.packetMesh = new THREE.InstancedMesh(pktGeo, pktMat, this.packetTracks.length)
    this.interposerGroup.add(this.packetMesh)

    this.tagPart(this.interposerGroup, 'interposer')
    this.rootGroup.add(this.interposerGroup)

    /* -------- TIER 3: Stacked HBM Towers + Glowing TSVs -------- */
    const hbmBaseMat = new THREE.MeshStandardMaterial({ color: '#1a2030', metalness: 0.72, roughness: 0.28 })
    const hbmSliceMat = new THREE.MeshStandardMaterial({ color: '#273147', metalness: 0.82, roughness: 0.22 })
    const dummyBaseMat = new THREE.MeshStandardMaterial({ color: '#1b1d22', metalness: 0.45, roughness: 0.62 })
    const dummySliceMat = new THREE.MeshStandardMaterial({ color: '#24272e', metalness: 0.4, roughness: 0.58 })

    if (this.profile === 'h100_910c') {
      // H100 SXM5: 6 physical HBM3 sites (3 left + 3 right) -> 5 active 8-Hi stacks (80 GB) + 1 fused-off dummy stack
      const h100Z = [-1.18, 0, 1.18]
      let gIdx = 0
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const isDummy = side === 1 && i === 0
          const stack = new THREE.Group()
          stack.position.set(side * 1.88, 0, h100Z[i])

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, 0.09, 0.94),
            isDummy ? dummyBaseMat : hbmBaseMat
          )
          base.position.y = 0.045
          base.castShadow = true
          stack.add(base)

          for (let tier = 0; tier < 5; tier++) {
            const slice = new THREE.Mesh(
              new THREE.BoxGeometry(0.64, 0.058, 0.9),
              isDummy ? dummySliceMat : hbmSliceMat
            )
            slice.position.y = 0.125 + tier * 0.072
            slice.castShadow = true
            stack.add(slice)
          }

          const glowMat = new THREE.MeshStandardMaterial({
            color: isDummy ? '#3b3e46' : '#0E9EE4',
            emissive: isDummy ? '#4a3528' : '#0E9EE4',
            emissiveIntensity: isDummy ? 0.06 : 0.85,
            roughness: isDummy ? 0.65 : 0.2,
            metalness: isDummy ? 0.25 : 0.35
          })
          const tsvStrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.74), glowMat)
          tsvStrip.position.set(-side * 0.33, 0.25, 0)
          stack.add(tsvStrip)

          const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.025, 0.82), glowMat)
          topCap.position.y = 0.48
          stack.add(topCap)

          // Crisp crossed fuse mark on the fused-off 6th dummy HBM site
          if (isDummy) {
            const xMat = new THREE.MeshStandardMaterial({
              color: '#6b6f76',
              emissive: '#E0523B',
              emissiveIntensity: 0.18,
              roughness: 0.5
            })
            const barA = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.015, 0.05), xMat)
            barA.position.y = 0.498
            barA.rotation.y = Math.PI / 4
            const barB = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.015, 0.05), xMat)
            barB.position.y = 0.498
            barB.rotation.y = -Math.PI / 4
            stack.add(barA, barB)
          }

          this.hbmGlowBars.push({ mat: glowMat, idx: gIdx++, arch: 'gpu', dummy: isDummy })
          this.hbmGpuGroup.add(stack)
        }
      }

      // Ascend 910C: 8 active HBM2e stacks (4 left for Die 0 + 4 right for Die 1 = 128 GB @ 3.2 TB/s)
      let nIdx = 0
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const stack = new THREE.Group()
          const z = -1.38 + i * 0.92
          stack.position.set(side * 1.88, 0, z)

          const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.74), hbmBaseMat)
          base.position.y = 0.045
          base.castShadow = true
          stack.add(base)

          for (let tier = 0; tier < 5; tier++) {
            const slice = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.058, 0.7), hbmSliceMat)
            slice.position.y = 0.125 + tier * 0.072
            slice.castShadow = true
            stack.add(slice)
          }

          const glowMat = new THREE.MeshStandardMaterial({
            color: '#2B5CFF',
            emissive: '#2B5CFF',
            emissiveIntensity: 0.85,
            roughness: 0.2,
            metalness: 0.3
          })
          const tsvStrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.56), glowMat)
          tsvStrip.position.set(-side * 0.33, 0.25, 0)
          stack.add(tsvStrip)

          const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.025, 0.62), glowMat)
          topCap.position.y = 0.48
          stack.add(topCap)

          this.hbmGlowBars.push({ mat: glowMat, idx: nIdx++, arch: 'npu', dummy: false })
          this.hbmNpuGroup.add(stack)
        }
      }
      this.hbmGroup.add(this.hbmGpuGroup, this.hbmNpuGroup)
    } else {
      let hIdx = 0
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const stack = new THREE.Group()
          const z = -1.38 + i * 0.92
          stack.position.set(side * 1.88, 0, z)

          // Base buffer die
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.74), hbmBaseMat)
          base.position.y = 0.045
          base.castShadow = true
          stack.add(base)

          // 5 stepped DRAM silicon slices (visualizing 12-Hi vertical stacking)
          for (let tier = 0; tier < 5; tier++) {
            const slice = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.058, 0.7), hbmSliceMat)
            slice.position.y = 0.125 + tier * 0.072
            slice.castShadow = true
            stack.add(slice)
          }

          // Glowing TSV vertical bandwidth strip on inner die-facing edge + top cap indicator
          const glowMat = new THREE.MeshStandardMaterial({
            color: '#2B5CFF',
            emissive: '#2B5CFF',
            emissiveIntensity: 0.85,
            roughness: 0.2,
            metalness: 0.3
          })
          const tsvStrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.56), glowMat)
          tsvStrip.position.set(-side * 0.33, 0.25, 0)
          stack.add(tsvStrip)

          const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.025, 0.62), glowMat)
          topCap.position.y = 0.48
          stack.add(topCap)

          this.hbmGlowBars.push({ mat: glowMat, idx: hIdx++ })
          this.hbmGroup.add(stack)
        }
      }
    }
    this.tagPart(this.hbmGroup, 'hbm')
    this.rootGroup.add(this.hbmGroup)

    /* -------- TIER 4A: GPU Compute Die -------- */
    const dieSubstrateMat = new THREE.MeshStandardMaterial({
      color: '#1b1f29',
      map: siliconTexGpu,
      metalness: 0.88,
      roughness: 0.2
    })
    const l2SpineMat = new THREE.MeshStandardMaterial({
      color: '#0e7a48',
      emissive: '#00CD6E',
      emissiveIntensity: 0.32,
      metalness: 0.65,
      roughness: 0.26
    })
    this.nvBridgeMat = new THREE.MeshStandardMaterial({
      color: '#FA6D01',
      emissive: '#FA6D01',
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.22
    })

    if (this.profile === 'h100_910c') {
      // Authentic NVIDIA H100 SXM5 (GH100): Single Monolithic 814 mm² Die + 50 MB Split L2 Crossbar + 8 GPCs (132 SMs)
      const monoDie = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.21, 3.38), dieSubstrateMat)
      monoDie.position.set(0, 0.105, 0)
      monoDie.castShadow = true
      monoDie.receiveShadow = true
      this.gpuDieGroup.add(monoDie)

      // Central 50 MB Split L2 Cache Crossbar + 3 horizontal GPC lane dividers (forming 8 distinct GPC zones)
      const l2CrossMat = new THREE.MeshStandardMaterial({
        color: '#0e7a56',
        emissive: '#0E9972',
        emissiveIntensity: 0.42,
        metalness: 0.62,
        roughness: 0.24
      })
      this.gpuL2CrossbarMat = l2CrossMat
      this.nvBridgeMat = l2CrossMat

      const l2Center = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.065, 3.16), l2CrossMat)
      l2Center.position.set(0, 0.225, 0)
      this.gpuDieGroup.add(l2Center)

      for (const rz of [-0.79, 0, 0.79]) {
        const gpcRib = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.045, 0.075), l2CrossMat)
        gpcRib.position.set(0, 0.22, rz)
        this.gpuDieGroup.add(gpcRib)
      }

      // 8 rows × 8 cols = 64 SM/TPC Cluster Tiles across 8 GPC quadrants (representing 132 active SMs)
      for (let r = 0; r < 8; r++) {
        const gpcRow = Math.floor(r / 2)
        const zBase = -1.39 + gpcRow * 0.795 + (r % 2) * 0.36
        for (let col = 0; col < 8; col++) {
          const isRight = col >= 4
          const localCol = isRight ? col - 4 : col
          const xPos = isRight ? 0.27 + localCol * 0.285 : -1.125 + localCol * 0.285
          const gpcId = gpcRow * 2 + (isRight ? 1 : 0)
          const tileMat = new THREE.MeshStandardMaterial({
            color: '#292c34',
            emissive: '#FA6D01',
            emissiveIntensity: 0.22,
            metalness: 0.72,
            roughness: 0.26
          })
          const tile = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.072, 0.29), tileMat)
          tile.position.set(xPos, 0.242, zBase)
          this.gpuDieGroup.add(tile)
          this.gpuSmTiles.push({ mesh: tile, mat: tileMat, ix: col, iz: r, die: gpcId })
        }
      }
    } else {
      // Central 10 TB/s NV-HBI Dual-Die Bridge
      const nvBridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 3.05), this.nvBridgeMat)
      nvBridge.position.set(0, 0.12, 0)
      this.gpuDieGroup.add(nvBridge)

      for (const die of [0, 1]) {
        const cx = die === 0 ? -0.76 : 0.76
        // Reticle die base
        const baseDie = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.2, 3.35), dieSubstrateMat)
        baseDie.position.set(cx, 0.1, 0)
        baseDie.castShadow = true
        baseDie.receiveShadow = true
        this.gpuDieGroup.add(baseDie)

        // Central L2 SRAM Cache spine running lengthwise through each die
        const l2Spine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 3.05), l2SpineMat)
        l2Spine.position.set(cx, 0.22, 0)
        this.gpuDieGroup.add(l2Spine)

        // 8 rows × 4 cols = 32 SM / Tensor Core cluster tiles per die (64 total!)
        for (let r = 0; r < 8; r++) {
          for (let col = 0; col < 4; col++) {
            const offsetX = col < 2 ? -0.45 + col * 0.24 : 0.21 + (col - 2) * 0.24
            const tileMat = new THREE.MeshStandardMaterial({
              color: '#2b2d34',
              emissive: '#FA6D01',
              emissiveIntensity: 0.2,
              metalness: 0.72,
              roughness: 0.26
            })
            const tile = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.31), tileMat)
            tile.position.set(cx + offsetX, 0.235, -1.36 + r * 0.39)
            this.gpuDieGroup.add(tile)
            this.gpuSmTiles.push({ mesh: tile, mat: tileMat, ix: die * 4 + col, iz: r, die })
          }
        }
      }
    }
    this.computeGroup.add(this.gpuDieGroup)

    /* -------- TIER 4B: NPU Da Vinci / Systolic AI Core Die -------- */
    const npuBaseMat = new THREE.MeshStandardMaterial({
      color: '#1e1c2b',
      map: siliconTexNpu,
      metalness: 0.86,
      roughness: 0.22
    })

    if (this.profile === 'h100_910c') {
      // Authentic Huawei Ascend 910C: Dual-Die Da Vinci v2 Chiplet Package (2× [24 AIC + 48 AIV] = 48 AIC / 96 AIV)
      const d2dMat = new THREE.MeshStandardMaterial({
        color: '#0E9EE4',
        emissive: '#0E9EE4',
        emissiveIntensity: 0.85,
        metalness: 0.55,
        roughness: 0.22
      })
      this.npuD2dBridgeMat = d2dMat
      const d2dBridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 3.06), d2dMat)
      d2dBridge.position.set(0, 0.12, 0)
      this.npuDieGroup.add(d2dBridge)

      let cIdx = 0
      let vIdx = 0
      for (const die of [0, 1]) {
        const cx = die === 0 ? -0.76 : 0.76
        const dieSlab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.21, 3.36), npuBaseMat)
        dieSlab.position.set(cx, 0.105, 0)
        dieSlab.castShadow = true
        dieSlab.receiveShadow = true
        this.npuDieGroup.add(dieSlab)

        // Dedicated 192 KB Unified Buffer (UB) SRAM Spine down each chiplet (turns crimson on UB Overflow!)
        const ubMat = new THREE.MeshStandardMaterial({
          color: '#0E9972',
          emissive: '#0E9972',
          emissiveIntensity: 0.55,
          metalness: 0.58,
          roughness: 0.24
        })
        this.npuUbMats.push(ubMat)
        const ubSpine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.068, 3.08), ubMat)
        ubSpine.position.set(cx, 0.235, 0)
        this.npuDieGroup.add(ubSpine)

        // 6 rows × 2 cols = 12 AIC Cube blocks per die (24 visual = 48 physical AIC) + 2× AIV Vector strips per Cube (1:2 ratio!)
        for (let r = 0; r < 6; r++) {
          const z = -1.26 + r * 0.504
          for (const sideCol of [-1, 1]) {
            const xCube = cx + sideCol * 0.34
            const cubeMat = new THREE.MeshStandardMaterial({
              color: '#342722',
              emissive: '#FA6D01',
              emissiveIntensity: 0.45,
              metalness: 0.68,
              roughness: 0.26
            })
            const cube = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.105, 0.26), cubeMat)
            cube.position.set(xCube, 0.258, z - 0.055)
            this.npuDieGroup.add(cube)
            this.npuCubeTiles.push({ mesh: cube, mat: cubeMat, idx: cIdx++, die })

            // Twin AIV Vector strips (2 AIV per 1 AIC, authentic Da Vinci v2 1:2 ratio)
            for (const sub of [-0.085, 0.085]) {
              const vecMat = new THREE.MeshStandardMaterial({
                color: '#2e2438',
                emissive: '#DE99FE',
                emissiveIntensity: 0.42,
                metalness: 0.65,
                roughness: 0.28
              })
              const vec = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.075, 0.115), vecMat)
              vec.position.set(xCube + sub, 0.245, z + 0.155)
              this.npuDieGroup.add(vec)
              this.npuVecTiles.push({ mesh: vec, mat: vecMat, idx: vIdx++, die })
            }
          }
        }
      }

      // 8× Perimeter MTE2/MTE3 DMA Engines (4 on outer left of Die 0, 4 on outer right of Die 1 facing 8× HBM2e)
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1
        const z = -1.26 + (i % 4) * 0.84
        const mteMat = new THREE.MeshStandardMaterial({
          color: '#1b2948',
          emissive: '#2B5CFF',
          emissiveIntensity: 0.55,
          metalness: 0.6,
          roughness: 0.28
        })
        const mte = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.088, 0.54), mteMat)
        mte.position.set(side * 1.36, 0.252, z)
        this.npuDieGroup.add(mte)
        this.npuMteTiles.push({ mesh: mte, mat: mteMat, idx: i })
      }
    } else {
      const npuDieBase = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.22, 3.35), npuBaseMat)
      npuDieBase.position.set(0, 0.11, 0)
      npuDieBase.castShadow = true
      this.npuDieGroup.add(npuDieBase)

      // Central cross-shaped L1 Unified Buffer (UB) SRAM Mesh (Emerald)
      const ubMat = new THREE.MeshStandardMaterial({
        color: '#00CD6E',
        emissive: '#00CD6E',
        emissiveIntensity: 0.45,
        metalness: 0.6,
        roughness: 0.25
      })
      const ubV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 3.08), ubMat)
      ubV.position.set(0, 0.25, 0)
      this.npuDieGroup.add(ubV)
      const ubH = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.07, 0.26), ubMat)
      ubH.position.set(0, 0.25, 0)
      this.npuDieGroup.add(ubH)

      // 16× Dedicated Cube Matrix Units (4×4 systolic blocks) + 16× Vector Core Strips + 8× MTE DMA blocks
      let cIdx = 0
      for (const qx of [-1, 1]) {
        for (const qz of [-1, 1]) {
          for (let r = 0; r < 2; r++) {
            for (let col = 0; col < 2; col++) {
              const x = qx * (0.48 + col * 0.56)
              const z = qz * (0.5 + r * 0.72)

              // Cube Unit (Square 16×16×16 systolic array — Signal Orange)
              const cubeMat = new THREE.MeshStandardMaterial({
                color: '#342722',
                emissive: '#FA6D01',
                emissiveIntensity: 0.45,
                metalness: 0.68,
                roughness: 0.26
              })
              const cube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.42), cubeMat)
              cube.position.set(x, 0.27, z - 0.08)
              this.npuDieGroup.add(cube)
              this.npuCubeTiles.push({ mesh: cube, mat: cubeMat, idx: cIdx })

              // Vector Core Strip right beside each Cube (Electric Lilac)
              const vecMat = new THREE.MeshStandardMaterial({
                color: '#2e2438',
                emissive: '#DE99FE',
                emissiveIntensity: 0.4,
                metalness: 0.65,
                roughness: 0.28
              })
              const vec = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.14), vecMat)
              vec.position.set(x, 0.255, z + 0.23)
              this.npuDieGroup.add(vec)
              this.npuVecTiles.push({ mesh: vec, mat: vecMat, idx: cIdx })
              cIdx++
            }
          }
        }
      }

      // 8× Perimeter MTE1/2/3 DMA Engines facing HBM3 stacks (Cobalt)
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1
        const z = -1.26 + (i % 4) * 0.84
        const mteMat = new THREE.MeshStandardMaterial({
          color: '#1b2948',
          emissive: '#2B5CFF',
          emissiveIntensity: 0.55,
          metalness: 0.6,
          roughness: 0.28
        })
        const mte = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.54), mteMat)
        mte.position.set(side * 1.32, 0.26, z)
        this.npuDieGroup.add(mte)
        this.npuMteTiles.push({ mesh: mte, mat: mteMat, idx: i })
      }
    }

    this.computeGroup.add(this.npuDieGroup)
    this.tagPart(this.computeGroup, 'compute')
    this.rootGroup.add(this.computeGroup)

    /* -------- TIER 5: 3D Paged KV-Cache / L1 SRAM Optical Lattice -------- */
    const kvFrameMat = new THREE.MeshPhysicalMaterial({
      color: '#de99fe',
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.1,
      depthWrite: false
    })
    const kvPlate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 3.5), kvFrameMat)
    this.kvGroup.add(kvPlate)

    // Wireframe perimeter border
    const kvEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.22, 0.05, 3.52)),
      new THREE.LineBasicMaterial({ color: '#DE99FE', transparent: true, opacity: 0.65 })
    )
    this.kvGroup.add(kvEdge)

    // 32 Paged KV Cache memory blocks (8×4) lighting up proportionally to Batch Size (B)
    for (let i = 0; i < 32; i++) {
      const col = i % 4
      const row = Math.floor(i / 4)
      const mat = new THREE.MeshStandardMaterial({
        color: '#3a2c4a',
        emissive: '#DE99FE',
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.78,
        roughness: 0.22
      })
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.3), mat)
      blk.position.set(-1.05 + col * 0.7, 0.06, -1.36 + row * 0.39)
      this.kvGroup.add(blk)
      this.kvBlocks.push({ mesh: blk, mat, idx: i })
    }
    this.tagPart(this.kvGroup, 'kv')
    this.rootGroup.add(this.kvGroup)

    /* -------- TIER 6: High-Speed Edge I/O (NVLink 5.0 / HCCS Optical Cages) -------- */
    const cageMat = new THREE.MeshStandardMaterial({ color: '#9ea3ab', metalness: 0.9, roughness: 0.24 })
    const portInnerMat = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.6 })
    let beamIdx = 0
    for (const zSide of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = -2.1 + i * 0.84
        const cage = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.44), cageMat)
        cage.position.set(x, 0.24, zSide * 3.08)
        cage.castShadow = true
        this.ioGroup.add(cage)

        const inner = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.08), portInnerMat)
        inner.position.set(x, 0.24, zSide * 3.29)
        this.ioGroup.add(inner)

        // Glowing optical link beam (extends outward when AllReduce active)
        const beamMat = new THREE.MeshStandardMaterial({
          color: '#2B5CFF',
          emissive: '#2B5CFF',
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.75
        })
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.55), beamMat)
        beam.position.set(x, 0.24, zSide * 3.55)
        this.ioGroup.add(beam)
        this.ioBeamMeshes.push({ mesh: beam, mat: beamMat, idx: beamIdx++ })
      }
    }
    this.tagPart(this.ioGroup, 'io')
    this.rootGroup.add(this.ioGroup)

    /* -------- TIER 7: Split Precision Stiffener + Micro-Fin Copper/Nickel Cold Plate -------- */
    // Machined metallic stiffener frame around silicon cavity
    const stiffMat = new THREE.MeshStandardMaterial({ color: '#585c63', metalness: 0.85, roughness: 0.32 })
    const makeHalfPlate = (isRight: boolean) => {
      const half = new THREE.Group()
      const sx = isRight ? 1 : -1

      // Base vapor-chamber heatspreader plate (left half or right half)
      const plateMat = new THREE.MeshStandardMaterial({
        map: isRight ? this.coldPlateTexGpuR : this.coldPlateTexGpuL,
        metalness: 0.78,
        roughness: 0.28,
        transparent: true,
        opacity: 1
      })
      if (isRight) this.coldPlateRightMat = plateMat
      else this.coldPlateLeftMat = plateMat

      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.16, 4.95), plateMat)
      plate.position.set(sx * 1.33, 0.08, 0)
      plate.castShadow = true
      plate.receiveShadow = true
      half.add(plate)

      // Copper thermal base pad beneath plate
      const copperMat = new THREE.MeshStandardMaterial({
        color: '#c87544',
        metalness: 0.9,
        roughness: 0.26,
        transparent: true,
        opacity: 1
      })
      this.thermalFinMats.push(copperMat)
      const cuBase = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.08, 4.45), copperMat)
      cuBase.position.set(sx * 1.28, -0.04, 0)
      half.add(cuBase)

      // 3 machined copper heatpipe channels embedded inside vapor chamber
      for (const zp of [-1.35, 0, 1.35]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.35, 10), copperMat)
        pipe.rotation.z = Math.PI / 2
        pipe.position.set(sx * 1.3, 0.17, zp)
        half.add(pipe)
      }

      // 11 machined micro-fin blades per half (22 total!)
      const finMat = new THREE.MeshStandardMaterial({
        color: '#b4b8b4',
        metalness: 0.86,
        roughness: 0.25,
        transparent: true,
        opacity: 1
      })
      this.thermalFinMats.push(finMat)
      for (let f = 0; f < 11; f++) {
        const z = -2.0 + f * 0.4
        const fin = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.26, 0.09), finMat)
        fin.position.set(sx * 1.3, 0.28, z)
        fin.castShadow = true
        half.add(fin)
      }

      // Section-cut highlight bevel edge along center split (visible in HALF CUTAWAY)
      const cutEdgeMat = new THREE.MeshStandardMaterial({
        color: '#FA6D01',
        emissive: '#FA6D01',
        emissiveIntensity: 0.35,
        roughness: 0.3
      })
      const cutStrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 4.96), cutEdgeMat)
      cutStrip.position.set(isRight ? 0.01 : -0.01, 0.1, 0)
      half.add(cutStrip)

      // Dual liquid-coolant quick-disconnect manifold nozzles (Inlet Blue / Outlet Orange)
      const nozzleMat = new THREE.MeshStandardMaterial({
        color: '#8f949b',
        metalness: 0.92,
        roughness: 0.2,
        transparent: true,
        opacity: 1
      })
      this.thermalFinMats.push(nozzleMat)
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.45, 16), nozzleMat)
      nozzle.rotation.x = Math.PI / 2
      nozzle.position.set(sx * 1.65, 0.24, -2.62)
      half.add(nozzle)

      const ringMat = new THREE.MeshStandardMaterial({
        color: isRight ? '#FA6D01' : '#2B5CFF',
        emissive: isRight ? '#FA6D01' : '#2B5CFF',
        emissiveIntensity: 0.5
      })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 20), ringMat)
      ring.position.set(sx * 1.65, 0.24, -2.78)
      half.add(ring)

      // Outer structural clamp lip
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 4.98), stiffMat)
      lip.position.set(sx * 2.66, 0.08, 0)
      half.add(lip)

      return half
    }

    this.thermalLeftHalf = makeHalfPlate(false)
    this.thermalRightHalf = makeHalfPlate(true)
    this.thermalGroup.add(this.thermalLeftHalf, this.thermalRightHalf)
    this.tagPart(this.thermalGroup, 'thermal')
    this.rootGroup.add(this.thermalGroup)

    /* -------- TIER 8: Agent × Runtime Architectural Software Halo Overlay -------- */
    const haloOrange = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(4.4, 0.06, 3.8)),
      new THREE.LineBasicMaterial({ color: '#FA6D01', transparent: true, opacity: 0.78 })
    )
    haloOrange.position.y = 0.46
    this.haloGroup.add(haloOrange)

    const haloBlue = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(4.9, 0.05, 4.3)),
      new THREE.LineBasicMaterial({ color: '#2B5CFF', transparent: true, opacity: 0.65 })
    )
    haloBlue.position.y = 0.0
    this.haloGroup.add(haloBlue)

    // Corner vertical telemetry drop-lines
    const dropMat = new THREE.LineDashedMaterial({
      color: '#FA6D01',
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.48
    })
    for (const sx of [-2.2, 2.2]) {
      for (const sz of [-1.9, 1.9]) {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(sx, 0.46, sz),
          new THREE.Vector3(sx, -0.42, sz)
        ])
        const line = new THREE.Line(g, dropMat)
        line.computeLineDistances()
        this.haloGroup.add(line)
      }
    }
    this.rootGroup.add(this.haloGroup)

    /* -------- Precision Vertical Assembly Alignment Rods (visible during EXPLODED) -------- */
    const rodMat = new THREE.LineDashedMaterial({
      color: '#888882',
      dashSize: 0.14,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.55
    })
    for (const sx of [-2.65, 2.65]) {
      for (const sz of [-2.45, 2.45]) {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(sx, -1.8, sz),
          new THREE.Vector3(sx, 2.7, sz)
        ])
        const line = new THREE.Line(g, rodMat)
        line.computeLineDistances()
        this.guideRodGroup.add(line)
      }
    }
    this.rootGroup.add(this.guideRodGroup)

    /* -------- Register 3D World-Space Callout Anchors (Non-Crossing, Always Exposed) -------- */
    this.calloutAnchors = [
      { id: 'thermal', group: this.thermalLeftHalf, localPos: new THREE.Vector3(-1.35, 0.42, -1.45), side: 'left', yBias: 0 },
      { id: 'io', group: this.ioGroup, localPos: new THREE.Vector3(-1.26, 0.28, 3.12), side: 'left', yBias: 0 },
      { id: 'compute', group: this.computeGroup, localPos: new THREE.Vector3(0.75, 0.34, -0.35), side: 'right', yBias: 0 },
      { id: 'hbm', group: this.hbmGroup, localPos: new THREE.Vector3(1.9, 0.46, 0.95), side: 'right', yBias: 0 }
    ]
  }

  private applyTheme() {
    const isDark = document.documentElement.classList.contains('dark')
    this.scene.background = new THREE.Color(isDark ? '#141413' : '#EFEFEC')
    this.ambientLight.intensity = isDark ? 0.42 : 0.72
    this.keyLight.intensity = isDark ? 1.55 : 1.78
    this.rimLight.intensity = isDark ? 1.05 : 0.72
    this.renderer.toneMappingExposure = isDark ? 1.12 : 1.04

    // Update grid & shadow opacity
    const gridMats = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material]
    for (const m of gridMats) {
      const bm = m as THREE.LineBasicMaterial
      bm.color.set(isDark ? '#2a2a28' : '#d0d0ca')
      bm.transparent = true
      bm.opacity = isDark ? 0.65 : 0.75
    }
    ;(this.floorMesh.material as THREE.ShadowMaterial).opacity = isDark ? 0.35 : 0.13
  }

  private applyArchGeometry() {
    this.gpuDieGroup.visible = this.arch === 'gpu'
    this.npuDieGroup.visible = this.arch === 'npu'
    if (this.profile === 'h100_910c') {
      this.hbmGpuGroup.visible = this.arch === 'gpu'
      this.hbmNpuGroup.visible = this.arch === 'npu'
    }
    this.coldPlateLeftMat.map = this.arch === 'gpu' ? this.coldPlateTexGpuL : this.coldPlateTexNpuL
    this.coldPlateLeftMat.needsUpdate = true
    this.coldPlateRightMat.map = this.arch === 'gpu' ? this.coldPlateTexGpuR : this.coldPlateTexNpuR
    this.coldPlateRightMat.needsUpdate = true
  }

  private applyCutawayMaterials() {
    const isXray = this.cutaway === 'xray'
    const iso = this.isolate

    const applyOpacity = (group: THREE.Object3D, partId: Exclude<PartId, 'ALL'>, baseOpacity = 1) => {
      const dimmed = iso !== 'ALL' && iso !== partId
      const targetOp = dimmed ? 0.14 : baseOpacity
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          if (mat === (this.kvGroup.children[0] as THREE.Mesh)?.material) continue
          const std = mat as THREE.MeshStandardMaterial
          if (targetOp < 0.99) {
            std.transparent = true
            std.opacity = targetOp
            std.depthWrite = targetOp > 0.55
          } else {
            std.transparent = false
            std.opacity = 1
            std.depthWrite = true
          }
        }
      })
    }

    applyOpacity(this.pcbGroup, 'pcb', 1)
    applyOpacity(this.substrateGroup, 'pcb', 1)
    applyOpacity(this.interposerGroup, 'interposer', 1)
    applyOpacity(this.hbmGroup, 'hbm', 1)
    applyOpacity(this.computeGroup, 'compute', 1)
    applyOpacity(this.ioGroup, 'io', 1)
    applyOpacity(this.thermalGroup, 'thermal', isXray ? 0.13 : 1)
    // Lower PBR specular metalness in X-Ray so IBL reflections don't frost over the silicon die
    this.thermalGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial
        if (typeof std.metalness === 'number') {
          if (std.userData.baseMetalness === undefined) std.userData.baseMetalness = std.metalness
          std.metalness = isXray ? 0.12 : std.userData.baseMetalness
        }
      }
    })
    if (isXray) {
      for (const fm of this.thermalFinMats) {
        fm.opacity = 0.06
        fm.depthWrite = false
      }
    }

    // KV lattice visibility: keep HALF CUTAWAY clean on silicon unless inspecting KV or Exploded/X-Ray
    const showKv =
      this.profile === 'h100_910c'
        ? this.cutaway === 'exploded' || iso === 'kv'
        : this.cutaway === 'exploded' ||
          this.cutaway === 'xray' ||
          iso === 'kv' ||
          this.workload === 'decode' ||
          this.workload === 'flashattn'
    this.kvGroup.visible = showKv
  }

  /* ---------- Public API for UI Controls ---------- */

  public setArch(arch: ArchMode) {
    this.arch = arch
    this.applyArchGeometry()
  }
  public setScenario(sc: DispatchScenario) {
    this.scenario = sc
    this.applyCutawayMaterials()
  }
  public setPrecision(p: PrecisionMode) {
    this.precision = p
  }
  public setWorkload(w: WorkloadMode) {
    this.workload = w
    this.applyCutawayMaterials()
  }
  public setBatch(b: number) {
    this.batch = Math.max(1, Math.min(256, b))
  }
  public setPaused(p: boolean) {
    this.paused = p
  }
  public stepCycle(delta: number) {
    this.paused = true
    this.cycle += delta
  }
  public setCutaway(mode: CutawayMode) {
    this.cutaway = mode
    if (mode === 'exploded') {
      this.tExplode = 1.0
      this.tCutawaySlide = 0.0
    } else if (mode === 'cutaway') {
      this.tExplode = 0.12
      this.tCutawaySlide = 1.0
    } else if (mode === 'xray') {
      this.tExplode = 0.22
      this.tCutawaySlide = 0.0
    } else {
      this.tExplode = 0.0
      this.tCutawaySlide = 0.0
    }
    this.applyCutawayMaterials()
  }
  public setExplode(val01: number) {
    this.tExplode = Math.max(0, Math.min(1, val01))
    if (val01 > 0.35 && this.cutaway === 'assembled') {
      this.cutaway = 'exploded'
      this.tCutawaySlide = 0
      this.applyCutawayMaterials()
    }
  }
  public setCameraPreset(preset: CameraPreset) {
    const p = CAMERA_PRESETS[preset]
    this.tAz = p.az
    this.tEl = p.el
    this.tDist = p.dist
    this.tTargetY = p.targetY
  }
  public setIsolate(part: PartId) {
    this.isolate = part
    if (part !== 'ALL' && this.cutaway === 'assembled') {
      this.setCutaway('exploded')
    } else {
      this.applyCutawayMaterials()
    }
  }
  public setCallouts(on: boolean) {
    this.calloutsEnabled = on
  }
  public setHalo(on: boolean) {
    this.haloEnabled = on
    this.haloGroup.visible = on
  }
  public getState() {
    return {
      arch: this.arch,
      precision: this.precision,
      workload: this.workload,
      cutaway: this.cutaway,
      isolate: this.isolate,
      batch: this.batch,
      paused: this.paused,
      explodePct: Math.round(this.tExplode * 100)
    }
  }

  /* ---------- Pointer Orbit, Zoom, Raycast Hover & Click ---------- */

  private bindEvents() {
    this.container.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      this.cb.onUserInteract()
      this.dragging = true
      this.movedPx = 0
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.container.setPointerCapture(e.pointerId)
    })

    this.container.addEventListener('pointermove', (e) => {
      const rect = this.container.getBoundingClientRect()
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      if (this.dragging) {
        const dx = e.clientX - this.lastX
        const dy = e.clientY - this.lastY
        this.movedPx += Math.hypot(dx, dy)
        this.tAz -= dx * 0.008
        this.tEl = Math.max(0.08, Math.min(1.48, this.tEl + dy * 0.007))
        this.lastX = e.clientX
        this.lastY = e.clientY
        this.cb.onHoverPart(null, 0, 0)
        return
      }

      // Hover picking
      const hit = this.pickPart()
      if (hit) {
        this.cb.onHoverPart(this.getCatalog()[this.arch][hit], e.clientX - rect.left, e.clientY - rect.top)
        this.container.style.cursor = 'pointer'
      } else {
        this.cb.onHoverPart(null, 0, 0)
        this.container.style.cursor = 'grab'
      }
    })

    this.container.addEventListener('pointerup', (e) => {
      const wasClick = this.dragging && this.movedPx < 6
      this.dragging = false
      if (wasClick && !(e.target as HTMLElement).closest('button')) {
        const hit = this.pickPart()
        if (hit) {
          const next: PartId = this.isolate === hit ? 'ALL' : hit
          this.setIsolate(next)
          this.cb.onSelectPart(next)
        }
      }
    })

    this.container.addEventListener('pointerleave', () => {
      this.dragging = false
      this.pointer.set(-10, -10)
      this.cb.onHoverPart(null, 0, 0)
    })

    this.container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.cb.onUserInteract()
        this.tDist = Math.max(7.2, Math.min(20.5, this.tDist + e.deltaY * 0.01))
      },
      { passive: false }
    )
  }

  private pickPart(): Exclude<PartId, 'ALL'> | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickables, false)
    for (const h of hits) {
      if (!h.object.visible) continue
      let p: THREE.Object3D | null = h.object
      let hidden = false
      while (p) {
        if (!p.visible) {
          hidden = true
          break
        }
        p = p.parent
      }
      if (hidden) continue
      const id = h.object.userData.partId as Exclude<PartId, 'ALL'> | undefined
      if (id) return id
    }
    return null
  }

  public resize() {
    const r = this.container.getBoundingClientRect()
    if (!r.width || !r.height) return
    this.camera.aspect = r.width / r.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(r.width, r.height, false)
  }

  /* ---------- Frame Update & Animation Loop ---------- */

  private updateScene(hw: HardwareTelemetry) {
    // Smooth pose damping
    const damp = this.reduceMotion ? 0.35 : 0.11
    this.az += (this.tAz - this.az) * damp
    this.el += (this.tEl - this.el) * damp
    this.dist += (this.tDist - this.dist) * damp
    this.targetY += (this.tTargetY - this.targetY) * damp
    this.explode += (this.tExplode - this.explode) * damp
    this.cutawaySlide += (this.tCutawaySlide - this.cutawaySlide) * damp

    // Position spherical orbit camera
    const cx = this.dist * Math.cos(this.el) * Math.sin(this.az)
    const cy = this.targetY + this.dist * Math.sin(this.el)
    const cz = this.dist * Math.cos(this.el) * Math.cos(this.az)
    this.camera.position.set(cx, cy, cz)
    this.camera.lookAt(0, this.targetY, 0)

    // Vertical mechanical stack explosion offsets (zero Z-fighting clearances)
    const ex = this.explode
    this.pcbGroup.position.y = -1.3 - ex * 0.62
    this.ioGroup.position.y = this.pcbGroup.position.y
    this.substrateGroup.position.y = -0.99 - ex * 0.24
    this.interposerGroup.position.y = -0.82 + ex * 0.2
    this.hbmGroup.position.y = -0.75 + ex * 0.68
    this.computeGroup.position.y = -0.75 + ex * 0.82
    this.kvGroup.position.y = -0.22 + ex * 1.24
    this.thermalGroup.position.y = -0.16 + ex * 1.94
    this.haloGroup.position.y = 0.56 + ex * 2.15
    this.haloGroup.visible = this.haloEnabled && (ex > 0.05 || this.cutaway === 'xray')
    this.guideRodGroup.visible = ex > 0.28

    // Half-Cutaway mechanical slide & Top-Down Floorplan clear view
    const topDownClear = this.el > 1.15 && this.cutaway === 'xray' && this.isolate !== 'thermal'
    this.thermalGroup.visible = !topDownClear
    const slide = this.cutawaySlide
    this.thermalRightHalf.position.set(slide * 1.9, slide * 0.35, 0)
    this.thermalRightHalf.visible = !topDownClear && slide < 0.92
    if (this.cutaway === 'cutaway') {
      this.coldPlateRightMat.transparent = true
      this.coldPlateRightMat.opacity = Math.max(0, 1 - slide * 1.25)
    }

    // 1. Animate GPU SM / Tensor Core Systolic Diagonal Wave
    const ph = this.cycle * 0.26
    const sc = this.profile === 'h100_910c' ? (this.scenario === 'none' ? 'f2_stream' : this.scenario) : 'none'
    const isUbOverflow = this.profile === 'h100_910c' && this.arch === 'npu' && sc === 'f3_unopt'

    if (this.arch === 'gpu') {
      if (this.profile === 'h100_910c') {
        for (const t of this.gpuSmTiles) {
          const wave = 0.5 + 0.5 * Math.sin(ph - (t.ix * 0.55 + t.iz * 0.45))
          if (sc === 'f3_unopt') {
            // Only 16 / 132 SMs active (top GPC row: 8 of 64 tiles lit, 88% of GH100 die cold idle!)
            const isBusy = t.iz === 0
            t.mat.emissive.set(isBusy ? '#E0523B' : '#2a2224')
            t.mat.emissiveIntensity = isBusy ? 0.9 + 0.55 * wave : 0.03
          } else if (sc === 'f1_launch') {
            // Launch-bound tiny shape: intermittent burst on 16 SMs
            const burst = Math.pow(Math.max(0, Math.sin(ph * 0.75)), 4)
            const isBusy = t.iz === 0
            t.mat.emissive.set(isBusy ? '#7E4F8E' : '#23242b')
            t.mat.emissiveIntensity = isBusy ? 0.25 + burst * 1.15 : 0.04
          } else if (sc === 'f3_opt') {
            // Split-KV Stage 1 + LSE Combine: all 128/132 SMs blazing + L2 crossbar golden-emerald merge!
            const isLseRing = t.ix === 3 || t.ix === 4
            t.mat.emissive.set(isLseRing && wave > 0.65 ? '#0E9972' : '#FA6D01')
            t.mat.emissiveIntensity = 0.35 + wave * 1.15
          } else {
            // F2 Stream sweet spot: smooth full-die streaming waves across all 8 GPCs
            t.mat.emissive.set((t.ix + t.iz) % 4 === 0 ? '#0E9EE4' : '#FA6D01')
            t.mat.emissiveIntensity = 0.28 + wave * 1.08
          }
        }
        if (this.gpuL2CrossbarMat) {
          if (sc === 'f3_opt') {
            this.gpuL2CrossbarMat.color.set('#0E9972')
            this.gpuL2CrossbarMat.emissive.set('#0E9972')
            this.gpuL2CrossbarMat.emissiveIntensity = 0.85 + 0.65 * Math.sin(ph * 1.8)
          } else if (sc === 'f3_unopt') {
            this.gpuL2CrossbarMat.color.set('#3d4248')
            this.gpuL2CrossbarMat.emissive.set('#E0523B')
            this.gpuL2CrossbarMat.emissiveIntensity = 0.14
          } else {
            this.gpuL2CrossbarMat.color.set('#0e7a56')
            this.gpuL2CrossbarMat.emissive.set('#0E9972')
            this.gpuL2CrossbarMat.emissiveIntensity = 0.38 + 0.32 * Math.sin(ph * 1.1)
          }
        }
      } else {
        const mmaGain = 0.22 + (hw.mfu / 100) * 1.35
        for (const t of this.gpuSmTiles) {
          const wave = 0.5 + 0.5 * Math.sin(ph - (t.ix * 0.65 + t.iz * 0.5))
          const active = hw.workload === 'decode' ? wave * 0.45 : wave
          t.mat.emissive.set(
            hw.workload === 'flashattn' && (t.ix + t.iz) % 3 === 0 ? '#DE99FE' : '#FA6D01'
          )
          t.mat.emissiveIntensity = 0.12 + active * mmaGain
        }
        this.nvBridgeMat.emissiveIntensity =
          hw.workload === 'allreduce' ? 1.55 + 0.45 * Math.sin(ph * 1.6) : 0.45 + 0.35 * (hw.mfu / 100)
      }
    } else {
      // 2. Animate NPU Da Vinci 3-Stage Pipeline: MTE2 Load -> Cube MMA -> Vector Softmax (+ 192 KB UB Spine!)
      if (this.profile === 'h100_910c') {
        const alarmPulse = 0.5 + 0.5 * Math.sin(ph * 2.6)
        for (const ubMat of this.npuUbMats) {
          if (isUbOverflow) {
            ubMat.color.set('#E0523B')
            ubMat.emissive.set('#E0523B')
            ubMat.emissiveIntensity = 0.7 + alarmPulse * 1.45
          } else if (sc === 'f3_opt') {
            ubMat.color.set('#0E9972')
            ubMat.emissive.set('#0E9972')
            ubMat.emissiveIntensity = 0.65 + 0.35 * Math.sin(ph * 1.2)
          } else if (sc === 'f1_launch') {
            ubMat.color.set('#7E4F8E')
            ubMat.emissive.set('#7E4F8E')
            ubMat.emissiveIntensity = 0.32 + 0.3 * Math.sin(ph)
          } else {
            // F2 Ping-Pong double buffer: brisk emerald pulse
            ubMat.color.set('#00CD6E')
            ubMat.emissive.set('#00CD6E')
            ubMat.emissiveIntensity = 0.55 + 0.55 * Math.sin(ph * 1.6)
          }
        }
        if (this.npuD2dBridgeMat) {
          if (isUbOverflow) {
            this.npuD2dBridgeMat.emissive.set('#E0523B')
            this.npuD2dBridgeMat.emissiveIntensity = 0.12
          } else if (sc === 'f3_opt') {
            this.npuD2dBridgeMat.emissive.set('#0E9EE4')
            this.npuD2dBridgeMat.emissiveIntensity = 0.95 + 0.55 * Math.sin(ph * 1.7)
          } else if (sc === 'f1_launch') {
            this.npuD2dBridgeMat.emissive.set('#7E4F8E')
            this.npuD2dBridgeMat.emissiveIntensity = 0.2
          } else {
            this.npuD2dBridgeMat.emissive.set('#0E9EE4')
            this.npuD2dBridgeMat.emissiveIntensity = 0.65 + 0.35 * Math.sin(ph * 1.3)
          }
        }
        for (const mte of this.npuMteTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - mte.idx * 0.55)
          if (isUbOverflow) {
            mte.mat.emissive.set('#E0523B')
            mte.mat.emissiveIntensity = 0.08 + 0.12 * alarmPulse
          } else if (sc === 'f1_launch' && mte.idx >= 2) {
            mte.mat.emissive.set('#2B5CFF')
            mte.mat.emissiveIntensity = 0.06
          } else {
            mte.mat.emissive.set('#2B5CFF')
            mte.mat.emissiveIntensity = 0.2 + w * (0.35 + hw.dmaDuty * 1.2)
          }
        }
        for (const cube of this.npuCubeTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - 0.85 - cube.idx * 0.32)
          if (isUbOverflow) {
            cube.mat.emissive.set('#382022')
            cube.mat.emissiveIntensity = 0.04
          } else if (sc === 'f1_launch' && (cube.die === 1 || cube.idx >= 4)) {
            cube.mat.emissive.set('#FA6D01')
            cube.mat.emissiveIntensity = 0.05
          } else {
            cube.mat.emissive.set('#FA6D01')
            cube.mat.emissiveIntensity = 0.2 + w * (0.35 + hw.mmaDuty * 1.35)
          }
        }
        for (const vec of this.npuVecTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - 1.75 - vec.idx * 0.22)
          if (isUbOverflow) {
            vec.mat.emissive.set('#E0523B')
            vec.mat.emissiveIntensity = 0.08 + 0.22 * alarmPulse
          } else if (sc === 'f1_launch' && (vec.die === 1 || vec.idx >= 8)) {
            vec.mat.emissive.set('#DE99FE')
            vec.mat.emissiveIntensity = 0.05
          } else {
            vec.mat.emissive.set('#DE99FE')
            vec.mat.emissiveIntensity = 0.18 + w * (0.25 + hw.vecDuty * 1.3)
          }
        }
      } else {
        for (const mte of this.npuMteTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - mte.idx * 0.55)
          mte.mat.emissiveIntensity = 0.2 + w * (0.4 + hw.dmaDuty * 1.2)
        }
        for (const cube of this.npuCubeTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - 0.9 - cube.idx * 0.35)
          cube.mat.emissiveIntensity = 0.18 + w * (0.35 + hw.mmaDuty * 1.45)
        }
        for (const vec of this.npuVecTiles) {
          const w = 0.5 + 0.5 * Math.sin(ph - 1.8 - vec.idx * 0.35)
          vec.mat.emissiveIntensity = 0.15 + w * (0.25 + hw.vecDuty * 1.4)
        }
      }
    }

    // 3. Animate HBM TSV Bandwidth Bars (skip fused-off dummy stack on H100!)
    const bwRatio = hw.hbmBw / hw.peakHbmBw
    for (const h of this.hbmGlowBars) {
      if (h.dummy) {
        h.mat.emissiveIntensity = 0.05
        continue
      }
      if (h.arch && h.arch !== this.arch) continue
      const pulse = 0.55 + 0.45 * Math.sin(ph * 1.3 + h.idx * 0.8)
      if (isUbOverflow) {
        h.mat.emissive.set('#E0523B')
        h.mat.emissiveIntensity = 0.08 + 0.12 * Math.sin(ph * 2.6)
      } else {
        h.mat.emissive.set(this.profile === 'h100_910c' && this.arch === 'gpu' ? '#0E9EE4' : '#2B5CFF')
        h.mat.emissiveIntensity = 0.16 + bwRatio * 1.45 * pulse
      }
    }

    // 4. Animate KV Cache Paged Blocks (occupancy scales with Batch Size B!)
    const litCount = Math.max(2, Math.round((this.batch / 256) * this.kvBlocks.length))
    for (const kv of this.kvBlocks) {
      const isLit = kv.idx < litCount
      const flashWave = 0.5 + 0.5 * Math.sin(ph * 1.2 - kv.idx * 0.35)
      if (isUbOverflow) {
        kv.mat.emissive.set('#E0523B')
        kv.mat.emissiveIntensity = 0.65 + 0.65 * Math.sin(ph * 2.6)
        kv.mat.opacity = 0.9
      } else if (isLit) {
        kv.mat.emissive.set(hw.workload === 'flashattn' ? '#00CD6E' : '#DE99FE')
        kv.mat.emissiveIntensity = 0.35 + flashWave * (hw.workload === 'decode' ? 1.25 : 0.85)
        kv.mat.opacity = 0.86
      } else {
        kv.mat.emissiveIntensity = 0.05
        kv.mat.opacity = 0.22
      }
    }

    // 5. Animate NVLink / HCCS Optical I/O Beams
    const linkRatio = hw.linkGbps / hw.peakLinkGbps
    for (const b of this.ioBeamMeshes) {
      const w = 0.5 + 0.5 * Math.sin(ph * 1.8 + b.idx * 0.7)
      b.mesh.scale.z = 0.25 + linkRatio * (0.85 + 0.35 * w)
      b.mat.emissive.set(
        sc === 'f1_launch' ? '#7E4F8E' : hw.workload === 'allreduce' ? '#00CD6E' : '#2B5CFF'
      )
      b.mat.emissiveIntensity = 0.3 + linkRatio * 1.4 * w
      b.mat.opacity = 0.25 + linkRatio * 0.7
    }

    // 6. Animate VRM Power Delivery Rail proportional to TDP
    this.vrmStripMat.emissive.set(isUbOverflow ? '#E0523B' : '#FA6D01')
    this.vrmStripMat.emissiveIntensity = 0.25 + (hw.tdpWatts / 1000) * 1.15

    // 7. Animate 3D Data Bus Packets on CoWoS Interposer
    for (let i = 0; i < this.packetTracks.length; i++) {
      const tr = this.packetTracks[i]
      if ((tr.arch && tr.arch !== this.arch) || isUbOverflow) {
        this.dummy.scale.set(0, 0, 0)
        this.dummy.updateMatrix()
        this.packetMesh.setMatrixAt(i, this.dummy.matrix)
        continue
      }
      const rate =
        tr.kind === 'hbm'
          ? 0.2 + bwRatio * 1.25
          : tr.kind === 'bridge'
            ? sc === 'f3_opt'
              ? 1.35
              : 0.3 + (hw.mfu / 100) * 1.2
            : 0.2 + linkRatio * 1.4
      const u = ((this.cycle * 0.045 * tr.speed * rate + tr.offset) % 1 + 1) % 1
      this.dummy.position.lerpVectors(tr.from, tr.to, u)
      const visScale = rate > 0.26 ? 1 : 0.35
      this.dummy.scale.set(visScale, visScale, visScale)
      this.dummy.rotation.set(0, tr.kind === 'io' ? Math.PI / 2 : 0, 0)
      this.dummy.updateMatrix()
      this.packetMesh.setMatrixAt(i, this.dummy.matrix)

      this.tmpColor.set(
        tr.kind === 'hbm'
          ? this.profile === 'h100_910c' && this.arch === 'gpu'
            ? '#0E9EE4'
            : '#2B5CFF'
          : tr.kind === 'bridge'
            ? sc === 'f3_opt'
              ? '#0E9972'
              : '#FA6D01'
            : '#00CD6E'
      )
      this.packetMesh.setColorAt(i, this.tmpColor)
    }
    this.packetMesh.instanceMatrix.needsUpdate = true
    if (this.packetMesh.instanceColor) this.packetMesh.instanceColor.needsUpdate = true

    // Project 3D world-space CAD callout anchors to viewport coordinates
    if (this.calloutsEnabled) {
      const w = this.container.clientWidth
      const h = this.container.clientHeight
      const catalog = this.getCatalog()[this.arch]
      const projected = this.calloutAnchors.map((a) => {
        const worldPos = a.localPos.clone()
        a.group.localToWorld(worldPos)
        worldPos.project(this.camera)
        const sx = (worldPos.x * 0.5 + 0.5) * w
        const sy = (-worldPos.y * 0.5 + 0.5) * h + a.yBias
        const info = catalog[a.id]
        let liveSub = info.subtitle
        if (this.profile === 'h100_910c') {
          if (a.id === 'compute') liveSub = hw.activeUnitsLabel || info.subtitle
          else if (a.id === 'hbm')
            liveSub =
              this.arch === 'gpu'
                ? `${hw.hbmBw.toFixed(2)} / 3.35 TB/s · 5+1 HBM3`
                : `${hw.hbmBw.toFixed(2)} / 3.20 TB/s · 8× HBM2e`
          else if (a.id === 'io')
            liveSub =
              this.arch === 'gpu'
                ? `NVLink 4 (900 GB/s) · τ_launch 4 µs`
                : `UB/HCCS (784 GB/s) · τ_launch 12 µs`
          else if (a.id === 'thermal') liveSub = hw.onChipLabel || `${hw.tdpWatts}W · ${hw.tempC}°C`
        } else {
          if (a.id === 'compute') liveSub = `${Math.round(hw.achievedTflops)} TFLOPS ${hw.precision.toUpperCase()} · MFU ${hw.mfu.toFixed(0)}%`
          else if (a.id === 'hbm') liveSub = `${hw.hbmBw.toFixed(2)} / ${hw.peakHbmBw.toFixed(1)} TB/s LIVE`
          else if (a.id === 'io') liveSub = `${Math.round(hw.linkGbps)} GB/s ${this.arch === 'gpu' ? 'NVLink 5' : 'HCCS'}`
          else if (a.id === 'thermal') liveSub = `${hw.tdpWatts}W TDP · ${hw.tempC}°C DIE`
        }
        const ok =
          worldPos.z < 1 &&
          sx > 24 &&
          sx < w - 24 &&
          sy > 44 &&
          sy < h - 72 &&
          !(a.id === 'thermal' && !this.thermalGroup.visible) &&
          (this.isolate === 'ALL' || this.isolate === a.id)
        return {
          id: a.id,
          x: sx,
          y: sy,
          side: a.side,
          title: info.title,
          sub: liveSub,
          color: hw.alertLevel === 'error' && a.id === 'compute' ? '#E0523B' : info.color,
          visible: ok
        }
      })
      this.cb.onCalloutsUpdate(projected)
    } else {
      this.cb.onCalloutsUpdate([])
    }
  }

  private tick = (ts: number) => {
    this.rafId = requestAnimationFrame(this.tick)
    if (!this.visible) return
    if (ts - this.lastTs < 24) return
    this.lastTs = ts

    if (!this.reduceMotion && !this.paused) {
      this.cycle += 0.42
    }

    const hw = computeHardwareTelemetry(
      this.arch,
      this.precision,
      this.workload,
      this.batch,
      this.cycle,
      this.profile,
      this.scenario
    )
    this.updateScene(hw)
    this.renderer.render(this.scene, this.camera)

    if (ts - this.lastTelemetryTs >= 80) {
      this.lastTelemetryTs = ts
      this.cb.onTelemetry(hw)
    }
  }

  public dispose() {
    cancelAnimationFrame(this.rafId)
    this.resizeObs.disconnect()
    this.interObs.disconnect()
    this.themeObs.disconnect()
    this.pmrem.dispose()
    this.renderer.dispose()
  }
}
