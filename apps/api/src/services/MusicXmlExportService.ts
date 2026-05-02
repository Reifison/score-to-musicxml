import { safeMusicXmlFilename } from "../utils/filenames.js";

export class MusicXmlExportService {
  public downloadNameFor(originalFilename: string): string {
    return safeMusicXmlFilename(originalFilename);
  }

  public minimalValidScore(title: string, warning: string): string {
    const escapedTitle = this.escapeXml(title);
    const escapedWarning = this.escapeXml(warning);
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapedTitle}</work-title>
  </work>
  <identification>
    <encoding>
      <software>Score to MusicXML MVP</software>
    </encoding>
    <miscellaneous>
      <miscellaneous-field name="conversion-warning">${escapedWarning}</miscellaneous-field>
    </miscellaneous>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>
`;
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}
