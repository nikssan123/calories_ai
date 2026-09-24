-- A guest made by one of Google's test devices.
--
-- Every Play upload is walked by robots — the pre-launch report on Firebase
-- Test Lab, then review — and since guest accounts shipped, each walk ends in a
-- real row: the 1.6.0 upload made four in two minutes, from Los Angeles and
-- Sydney, two of them with push tokens the alert pass would have written to.
-- The app now says so when it asks for the session (`lib/test-device.ts`), the
-- scheduler leaves these rows alone, and `purgeTestDeviceGuests` deletes them
-- once the robots are done with them.

ALTER TABLE users
  ADD COLUMN test_device boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.test_device IS
  'guest created on a Google test device (Test Lab / pre-launch); purged after a few hours (070)';
