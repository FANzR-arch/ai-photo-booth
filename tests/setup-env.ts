// Tests never write customer-photo copies to the real desktop; archive tests pass their own folder.
process.env.PHOTO_ARCHIVE_DIR = 'off';
