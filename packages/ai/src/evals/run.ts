import { hotelToday } from '@orbit/domain';
import { buildInquiryFixtures } from './inquiries';

const fixtures = buildInquiryFixtures(hotelToday(new Date()));

// The extractor arrives with the agent; until then this only checks that fixtures load.
console.log(`${fixtures.length} inquiry fixtures loaded. Extraction is not implemented yet.`);
