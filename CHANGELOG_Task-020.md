# Task-020 Change Log

## Added

- Bike Selector page and feature module
- Brand, model, model-year selection UI
- TanStack Query hooks and frontend API client
- Versioned Route Handlers for brand/model/year options
- Route → Service → Repository → Supabase backend layers
- Zod path parameter validation
- Common API response helpers

## Behavior

- Brand change resets model and year
- Model change resets year
- Model/year fields remain disabled until prerequisites are selected
- Submit is enabled only after model year selection
- Submit navigates to `/fitment-result?bikeModelYearId={id}`

## Database

- `01_brand`
- `02_bike_model`
- `03_bike_model_year`

No schema or seed data changes.
