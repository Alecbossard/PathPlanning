import * as THREE from 'three';

export enum ConeType {
  BLUE = 'BLUE',
  YELLOW = 'YELLOW',
  ORANGE = 'ORANGE', // Start/Finish
  CAR_START = 'CAR_START' // Parsed from CSV
}

export enum CameraMode {
  ORBIT = 'ORBIT',
  CHASE = 'CHASE',
  COCKPIT = 'COCKPIT',
  HELICOPTER = 'HELICOPTER'
}

export enum OptimizerMode {
  NONE = 'NONE',
  LAPLACIAN = 'LAPLACIAN',
  RRT = 'RRT',
  QP = 'QP',
  HYBRID = 'HYBRID',
  RRT_QP = 'RRT_QP',
  LOCAL = 'LOCAL'
}

export interface ConeData {
  id: string;
  x: number;
  y: number;
  z: number; // Elevation
  type: ConeType;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number; // Elevation
  trackWidth?: number;
  dist: number; // Cumulative distance from start
  curvature: number; // 1/Radius
  maxVelocity: number; // Calculated limit based on friction
  velocity: number; // Final smoothed profile
  acceleration: number; // m/s^2
  yaw: number; // Heading in radians
  pitch: number; // Slope in radians
  color: string; // Visualization color
}

export interface TrackMetadata {
  name: string;
  totalLength: number;
  avgSpeed: number;
  estLapTime: number;
  maxLatG: number;
  maxLongG: number;
  minLongG: number;
}

export interface EditorState {
  selectedConeId: string | null;
  isDragging: boolean;
  mode: 'VIEW' | 'EDIT';
}