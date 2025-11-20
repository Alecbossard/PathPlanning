
export const PHYSICS = {
  GRAVITY: 9.81,
  FRICTION_COEFF: 1.5, // Slick tires Formula Student (slightly optimistic)
  MAX_VELOCITY: 35.0, // m/s (~126 km/h)
  MAX_ACCEL: 10.0, // m/s^2 (0-100kph in <3s)
  MAX_BRAKING: 15.0, // m/s^2 (High downforce braking)
  CAR_MASS: 250, // kg
  TRACK_WIDTH_LIMIT: 35, // Increased for larger tracks like Shanghai & Circuit 3
};

export const VISUALS = {
  CONE_HEIGHT: 0.5,
  CONE_RADIUS: 0.2,
  PATH_Y_OFFSET: 0.05,
  BLUE_COLOR: '#3b82f6',
  YELLOW_COLOR: '#eab308',
  ORANGE_COLOR: '#f97316',
  // Heatmap: Red = Braking, Green = Accel, White = Coast
  COLOR_BRAKE: '#ef4444', 
  COLOR_COAST: '#ffffff',
  COLOR_ACCEL: '#22c55e',
};

export const TRACK_NAMES = {};

export const TRACK_CSVS = {};
