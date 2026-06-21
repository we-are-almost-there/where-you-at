import xml.etree.ElementTree as ET

# GPX 1.1 표준 네임스페이스
_NS = "http://www.topografix.com/GPX/1/1"


def parse(gpx_xml: str) -> list[dict]:
    """GPX XML 문자열을 파싱해 waypoint 딕셔너리 리스트로 반환한다.

    Returns:
        [{"lat": float, "lng": float, "sequence_order": int}, ...]
        trkpt 순서를 sequence_order로 보존하며 반환.
    """
    root = ET.fromstring(gpx_xml)
    waypoints = []
    for seq, trkpt in enumerate(root.iter(f"{{{_NS}}}trkpt")):
        waypoints.append({
            "lat": float(trkpt.attrib["lat"]),
            "lng": float(trkpt.attrib["lon"]),
            "sequence_order": seq,
        })
    return waypoints


if __name__ == "__main__":
    # 최소 GPX 샘플로 파서 동작 검증
    SAMPLE_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
    <trk>
        <trkseg>
            <trkpt lat="35.090000" lon="129.020000"/>
            <trkpt lat="35.095000" lon="129.030000"/>
            <trkpt lat="35.100000" lon="129.040000"/>
            <trkpt lat="35.105000" lon="129.050000"/>
            <trkpt lat="35.110000" lon="129.060000"/>
        </trkseg>
    </trk>
</gpx>"""

    result = parse(SAMPLE_GPX)
    assert len(result) == 5, f"waypoint 수 불일치: {len(result)}"
    assert result[0] == {"lat": 35.09, "lng": 129.02, "sequence_order": 0}
    assert result[-1]["sequence_order"] == 4
    print(f"[gpx_parser] 파싱 성공: {len(result)}개 waypoint")
    for wp in result:
        print(f"  {wp}")

    # 실제 GPX URL 테스트 (durunubi 서비스와 연동)
    import sys
    if len(sys.argv) > 1:
        from app.services.durunubi import fetch_gpx
        xml = fetch_gpx(sys.argv[1])
        wps = parse(xml)
        print(f"\n[실제 GPX] {sys.argv[1]}")
        print(f"  waypoint {len(wps)}개 파싱 완료")
        print(f"  첫 좌표: {wps[0]}")
        print(f"  마지막 좌표: {wps[-1]}")
