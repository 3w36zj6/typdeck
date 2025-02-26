export type Metadata = {
  pageCount: number;
  slides?: {
    [k: `${number}`]: {
      speakerNotes?: string;
    };
  };
};
