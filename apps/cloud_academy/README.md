# Bubble Chamber Particle Tracks Visualizer

An interactive educational web application built with React and Next.js that visualizes elementary particle tracks in a bubble chamber. This tool helps students learn how to identify different particles based on their track characteristics (shape, curvature, length, etc.).

## Features

- **Interactive Visualization**: Dark-themed bubble chamber display with randomly generated particle tracks
- **Particle Identification**: Hover over tracks to see particle information (type, charge, momentum)
- **Multiple Particle Types**: 
  - Muons (μ) - Long curved tracks
  - Pions (π) - Medium curved tracks, may decay
  - Electrons (e⁻) - Tight spirals
  - Positrons (e⁺) - Tight spirals with opposite curvature
  - Protons (p) - Thick, short tracks
  - Kaons (K) - May show decay kinks
- **Decay Visualization**: Some particles show decay points with visible kinks
- **Educational Guide**: Built-in legend explaining particle characteristics

## Getting Started

### Prerequisites

- Node.js 18+ and npm (or yarn/pnpm)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
npm start
```

## How It Works

The application generates random particle tracks based on realistic physics:

- **High momentum particles** (>30 GeV/c) appear as straight tracks
- **Low momentum charged particles** curve in the magnetic field
- **Electrons and positrons** lose energy quickly, forming tight spirals
- **Particle decay** is visualized with kinks and decay products
- **Track curvature** depends on momentum and charge

## Educational Use

This tool is designed to help students:

1. **Identify particles** by track characteristics:
   - Track length and curvature
   - Spiral patterns (electrons/positrons)
   - Decay kinks
   - Track thickness

2. **Understand physics**:
   - How magnetic fields affect charged particles
   - Particle decay processes
   - Momentum and energy loss

3. **Practice analysis**:
   - Hover over tracks to see particle information
   - Compare different particle types
   - Generate new events to see variety

## Technology Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **CSS Modules** - Component styling
- **HTML5 Canvas** - Particle track rendering

## License

This project is created for educational purposes.

